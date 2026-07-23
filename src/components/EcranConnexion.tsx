import { useState } from 'react';
import type { User } from '../types';
import {
  Stethoscope, CreditCard, Pill,
  FlaskConical, Building2, Hospital, ArrowLeft,
  Lock, User as UserIcon, AlertCircle, KeyRound
} from 'lucide-react';

interface EcranConnexionProps {
  users: User[];
  onLogin: (user: User) => void;
  onBack: () => void;
}

const roleIcons: Record<string, React.ReactNode> = {
  doctor: <Stethoscope className="w-4 h-4" />,
  cashier: <CreditCard className="w-4 h-4" />,
  pharmacy: <Pill className="w-4 h-4" />,
  magasinier: <Building2 className="w-4 h-4" />,
  laboratory: <FlaskConical className="w-4 h-4" />,
  billing: <Building2 className="w-4 h-4" />,
  admin: <KeyRound className="w-4 h-4" />,
};

const roleLabels: Record<string, string> = {
  doctor: 'Médecin',
  cashier: 'Caisse',
  pharmacy: 'Pharmacie',
  magasinier: 'Magasinier',
  laboratory: 'Laboratoire',
  billing: 'Facturation',
  admin: 'Administrateur',
};

export default function EcranConnexion({ users, onLogin, onBack }: EcranConnexionProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const staffUsers = users.filter((u) => u.role !== 'receptionist');
  const selectedUser = users.find((u) => u.id === selectedUserId);

  const handleLogin = () => {
    if (!selectedUserId) { setError('Choisir un identifiant'); return; }
    if (!password)       { setError('Saisir le mot de passe'); return; }
    const user = users.find((u) => u.id === selectedUserId);
    if (!user)           { setError('Utilisateur introuvable'); return; }
    if (user.password !== password) { setError('Mot de passe erroné'); return; }
    setError('');
    onLogin(user);
  };

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleLogin(); };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
         style={{
           background:
             'radial-gradient(1200px 600px at 20% 0%, rgba(15,139,141,.15), transparent 60%),' +
             'radial-gradient(900px 600px at 90% 100%, rgba(185,83,28,.12), transparent 60%),' +
             'linear-gradient(180deg, #d7ddd1 0%, #c4ccbb 100%)'
         }}>
      {/* Motif de fond : quadrillage carnet */}
      <div className="absolute inset-0 pointer-events-none opacity-40"
           style={{
             backgroundImage:
               'linear-gradient(rgba(31,36,33,.05) 1px, transparent 1px),' +
               'linear-gradient(90deg, rgba(31,36,33,.05) 1px, transparent 1px)',
             backgroundSize: '22px 22px',
           }} />

      <div className="relative w-full max-w-md">
        <button
          onClick={onBack}
          className="mb-5 inline-flex items-center gap-2 text-[var(--color-inksoft)] hover:text-[var(--color-cross)] transition font-mono text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          ← Retour à la réception
        </button>

        {/* Plaque laiton */}
        <div className="text-center mb-6">
          <div className="brass-plaque inline-flex items-center gap-3 px-6 py-3 rounded-sm">
            <Hospital className="w-8 h-8" strokeWidth={2.25} />
            <div className="text-left leading-none">
              <div className="text-xl font-bold tracking-[.3em]">SALFA</div>
              <div className="text-[10px] tracking-[.4em] opacity-80 mt-0.5">HOSPITAL · INFORMATION</div>
            </div>
          </div>
          <div className="mt-4 font-display text-[var(--color-ink)] text-2xl tracking-widest uppercase">
            Accès <span className="text-[var(--color-cross)]">Personnel</span>
          </div>
          <div className="mt-1 text-xs font-mono text-[var(--color-inksoft)] tracking-wider">
            Poste de travail · Saisir code d'accès
          </div>
        </div>

        {/* Dossier cartonné */}
        <div className="folder rounded-sm p-5 sm:p-6">
          {/* languette */}
          <div className="flex items-center gap-2 mb-5 -mt-10">
            <div className="folder-tab folder-tab-active rounded-t-sm">CONTRÔLE D'ACCÈS</div>
            <div className="flex-1 border-b border-dashed border-[var(--color-rule)] mb-[6px]" />
          </div>

          {/* Identifiant */}
          <label className="block text-[10px] font-display tracking-widest uppercase text-[var(--color-inksoft)] mb-1.5">
            <UserIcon className="w-3 h-3 inline mr-1" />Identifiant
          </label>
          <select
            value={selectedUserId}
            onChange={(e) => { setSelectedUserId(e.target.value); setError(''); }}
            className="field-reg w-full cursor-pointer"
          >
            <option value="">— Sélectionner un agent —</option>
            {staffUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id}  ·  {u.name}  —  {roleLabels[u.role] || u.role}
              </option>
            ))}
          </select>

          {/* Mot de passe */}
          <label className="block text-[10px] font-display tracking-widest uppercase text-[var(--color-inksoft)] mt-4 mb-1.5">
            <Lock className="w-3 h-3 inline mr-1" />Code secret
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            onKeyDown={onKey}
            className="field-reg field-mono w-full tracking-[.3em]"
            placeholder="••••••••"
            autoFocus
          />

          {/* Erreur */}
          {error && (
            <div className="mt-4 flex items-start gap-2 p-2.5 border border-[var(--color-stamp-red)] bg-[color:color-mix(in_srgb,var(--color-stamp-red)_8%,transparent)] text-[var(--color-stamp-red)] text-sm font-medium">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Bouton bakélite */}
          <button
            onClick={handleLogin}
            disabled={!selectedUserId || !password}
            className="btn-bake primary w-full mt-5 justify-center py-3 text-sm"
          >
            {(selectedUser && roleIcons[selectedUser.role]) || <KeyRound className="w-4 h-4"/>}
            <span>Ouvrir la session</span>
          </button>

          {/* Carte aide */}
          <div className="mt-5 border border-dashed border-[var(--color-rule)] bg-[var(--color-paper-2)]/60 p-3 text-[11px] font-mono text-[var(--color-inksoft)] leading-relaxed">
            <div className="flex items-center gap-2 text-[var(--color-ink)] mb-1.5 font-display tracking-widest uppercase text-[10px]">
              <KeyRound className="w-3 h-3" /> Codes de démo
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <span>DOC001 → <b>doc123</b></span>
              <span>CAS001 → <b>caisse123</b></span>
              <span>PHA001 → <b>pharma123</b></span>
              <span>MAG001 → <b>mag123</b></span>
              <span>LAB001 → <b>labo123</b></span>
              <span>HOS001 → <b>hosp123</b></span>
              <span>ADM001 → <b>admin123</b></span>
            </div>
          </div>
        </div>

        <p className="text-center text-[var(--color-inksoft)] text-[11px] font-mono mt-5 tracking-wider opacity-80">
          © 2026 · SALFA HIS · Conforme politique de confidentialité
        </p>
      </div>
    </div>
  );
}
