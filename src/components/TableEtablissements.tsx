import { useMemo, useRef, useState } from 'react';
import type { Etablissement, EtablissementType } from '../types';
import type { AppState } from '../store';
import {
  ETABLISSEMENT_TYPES,
  addAuditLog,
  etablissementFullAddress,
  etablissementTypeLabel,
  makeEtablissement,
  normalizeEtablissements,
  ticketSettingsFromEtablissement,
} from '../store';
import ConfirmModal from './ConfirmModal';
import {
  Building2, Plus, Search, Edit2, Trash2, Check, X, Star, Landmark,
  BadgeCheck, Upload, Image as ImageIcon, Printer, MapPin, Phone, Mail, User as UserIcon,
} from 'lucide-react';

interface Props {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  showToast: (msg: string) => void;
}

type FormState = Partial<Etablissement>;

const EMPTY_FORM: FormState = {
  code: '', name: '', tradeName: '', type: 'hopital', legalForm: '',
  nif: '', stat: '', rcs: '', numeroAgrement: '', numeroCnaps: '', capital: '',
  address: '', city: '', postalCode: '', region: '', country: 'Madagascar',
  phone: '', phone2: '', fax: '', email: '', website: '',
  directorName: '', directorTitle: '', directorPhone: '',
  bankName: '', bankAccount: '', logoUrl: '', notes: '',
  active: true, isPrincipal: false,
};

/**
 * TABLE « Identification de la société / de l'hôpital »
 * ----------------------------------------------------
 * Gestion complète (création, modification, suppression, activation) des
 * entités juridiques exploitant l'application : raison sociale, forme
 * juridique, identifiants fiscaux (NIF / STAT / RCS), agrément sanitaire,
 * coordonnées, représentant légal et coordonnées bancaires.
 *
 * L'établissement marqué « principal » alimente l'en-tête des tickets,
 * reçus et factures (paramètres d'impression).
 */
export default function TableEtablissements({ state, setState, showToast }: Props) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [confirm, setConfirm] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: '', name: '' });
  const logoInputRef = useRef<HTMLInputElement>(null);

  const etablissements = state.etablissements || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return etablissements.filter((e) => {
      const matchesSearch = !q || [e.code, e.name, e.tradeName, e.nif, e.stat, e.city, e.phone, e.email]
        .some((v) => (v || '').toLowerCase().includes(q));
      const matchesType = typeFilter === 'all' || e.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [etablissements, search, typeFilter]);

  const principal = etablissements.find((e) => e.isPrincipal);

  const set = (patch: FormState) => setForm((f) => ({ ...f, ...patch }));

  const openCreate = () => {
    const nextCode = `ETB-${String(etablissements.length + 1).padStart(3, '0')}`;
    setForm({ ...EMPTY_FORM, code: nextCode, isPrincipal: etablissements.length === 0 });
    setEditingId(null);
    setFormOpen(true);
  };

  const openEdit = (e: Etablissement) => {
    setForm({ ...e });
    setEditingId(e.id);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
  };

  const handleLogo = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { showToast('⚠️ Image trop volumineuse (maximum 1 Mo)'); return; }
    const reader = new FileReader();
    reader.onload = (r) => set({ logoUrl: r.target?.result as string });
    reader.readAsDataURL(file);
    ev.target.value = '';
  };

  const save = () => {
    const name = (form.name || '').trim();
    if (!name) { showToast('⚠️ La raison sociale est obligatoire'); return; }
    const code = (form.code || '').trim().toUpperCase();
    if (!code) { showToast('⚠️ Le code de l\'établissement est obligatoire'); return; }
    if (etablissements.some((e) => e.code.toUpperCase() === code && e.id !== editingId)) {
      showToast('⚠️ Ce code d\'établissement existe déjà');
      return;
    }

    setState((prev) => {
      const current = prev.etablissements || [];
      const record = makeEtablissement({
        ...form,
        id: editingId || undefined,
        code,
        name,
        createdAt: editingId ? current.find((e) => e.id === editingId)?.createdAt : undefined,
      });

      let list = editingId
        ? current.map((e) => (e.id === editingId ? record : e))
        : [...current, record];

      // Un seul établissement principal
      if (record.isPrincipal) {
        list = list.map((e) => (e.id === record.id ? e : { ...e, isPrincipal: false }));
      }
      list = normalizeEtablissements(list);

      const next: AppState = { ...prev, etablissements: list };
      const newPrincipal = list.find((e) => e.isPrincipal);
      if (newPrincipal) {
        next.ticketSettings = ticketSettingsFromEtablissement(prev.ticketSettings, newPrincipal);
      }
      addAuditLog(
        next,
        editingId ? 'MODIFICATION_ETABLISSEMENT' : 'AJOUT_ETABLISSEMENT',
        `${record.code} — ${record.name} (${etablissementTypeLabel(record.type)})`,
      );
      return next;
    });

    showToast(editingId ? '✅ Établissement mis à jour' : '✅ Établissement enregistré');
    closeForm();
  };

  const setPrincipal = (id: string) => {
    setState((prev) => {
      const list = normalizeEtablissements(
        (prev.etablissements || []).map((e) => ({ ...e, isPrincipal: e.id === id, active: e.id === id ? true : e.active })),
      );
      const next: AppState = { ...prev, etablissements: list };
      const p = list.find((e) => e.isPrincipal);
      if (p) next.ticketSettings = ticketSettingsFromEtablissement(prev.ticketSettings, p);
      addAuditLog(next, 'ETABLISSEMENT_PRINCIPAL', `${p?.code || id} — ${p?.name || ''}`);
      return next;
    });
    showToast('✅ Établissement principal mis à jour (en-tête des documents)');
  };

  const toggleActive = (id: string) => {
    setState((prev) => {
      const list = normalizeEtablissements(
        (prev.etablissements || []).map((e) => (e.id === id ? { ...e, active: !e.active } : e)),
      );
      const next: AppState = { ...prev, etablissements: list };
      const target = list.find((e) => e.id === id);
      addAuditLog(next, 'ETAT_ETABLISSEMENT', `${target?.code || id} — ${target?.active ? 'Activé' : 'Désactivé'}`);
      return next;
    });
  };

  const applyToDocuments = (e: Etablissement) => {
    setState((prev) => {
      const next: AppState = { ...prev, ticketSettings: ticketSettingsFromEtablissement(prev.ticketSettings, e) };
      addAuditLog(next, 'CONFIG_ETABLISSEMENT', `En-tête des documents repris de ${e.code} — ${e.name}`);
      return next;
    });
    showToast('✅ En-tête des documents mis à jour depuis cette fiche');
  };

  const remove = () => {
    const { id, name } = confirm;
    setState((prev) => {
      const list = normalizeEtablissements((prev.etablissements || []).filter((e) => e.id !== id));
      const next: AppState = { ...prev, etablissements: list };
      addAuditLog(next, 'SUPPRESSION_ETABLISSEMENT', name);
      return next;
    });
    showToast('Établissement supprimé');
    setConfirm({ isOpen: false, id: '', name: '' });
  };

  const inputCls = 'w-full px-3.5 py-2 border rounded-xl text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500';
  const labelCls = 'text-xs font-bold text-slate-700 block mb-1';

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-slate-800 text-xl flex items-center gap-2.5">
            <Landmark className="w-6 h-6 text-indigo-600" /> Identification de la Société / de l'Hôpital
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Table des entités exploitantes : raison sociale, forme juridique, NIF / STAT / RCS, agrément sanitaire, coordonnées et représentant légal.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 flex items-center gap-2 cursor-pointer text-xs font-bold shadow-md"
        >
          <Plus className="w-4 h-4" /> Nouvel établissement
        </button>
      </div>

      {/* Fiche principale en évidence */}
      {principal && (
        <div className="p-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 flex flex-wrap items-center gap-4 shadow-xs">
          <div className="w-14 h-14 rounded-xl bg-white border border-emerald-200 flex items-center justify-center overflow-hidden shrink-0">
            {principal.logoUrl
              ? (principal.logoUrl.length <= 5
                ? <span className="text-2xl">{principal.logoUrl}</span>
                : <img src={principal.logoUrl} alt="Logo" className="w-full h-full object-contain p-1" />)
              : <Building2 className="w-6 h-6 text-emerald-600" />}
          </div>
          <div className="min-w-[220px] flex-1">
            <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-700 flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" /> Établissement principal — en-tête des documents
            </div>
            <div className="font-bold text-slate-900 text-base">{principal.tradeName?.trim() || principal.name}</div>
            <div className="text-xs text-slate-600">
              {etablissementTypeLabel(principal.type)}
              {principal.legalForm ? ` · ${principal.legalForm}` : ''}
              {principal.nif ? ` · NIF ${principal.nif}` : ''}
              {principal.stat ? ` · STAT ${principal.stat}` : ''}
            </div>
            <div className="text-xs text-slate-500">{etablissementFullAddress(principal) || '—'}</div>
          </div>
          <button
            onClick={() => applyToDocuments(principal)}
            className="px-3.5 py-2 bg-white border border-emerald-300 text-emerald-800 rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5 hover:bg-emerald-100"
          >
            <Printer className="w-3.5 h-3.5" /> Reprendre sur les tickets & factures
          </button>
        </div>
      )}

      {/* Formulaire création / édition */}
      {formOpen && (
        <div className="p-5 bg-indigo-50/60 border border-indigo-200 rounded-2xl space-y-5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-indigo-950 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> {editingId ? 'Modifier la fiche d\'identification' : 'Enregistrer une société / un hôpital'}
            </h4>
            <button onClick={closeForm} className="p-1.5 rounded-lg hover:bg-white/70 cursor-pointer text-slate-500">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Identité */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Identité juridique</h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Code interne *</label>
                <input value={form.code || ''} onChange={(e) => set({ code: e.target.value.toUpperCase() })} className={`${inputCls} font-mono uppercase`} placeholder="ETB-001" />
              </div>
              <div className="lg:col-span-2">
                <label className={labelCls}>Raison sociale / Dénomination *</label>
                <input value={form.name || ''} onChange={(e) => set({ name: e.target.value })} className={`${inputCls} font-semibold`} placeholder="Ex : SALFA — Centre de Santé" />
              </div>
              <div>
                <label className={labelCls}>Nom commercial / Enseigne</label>
                <input value={form.tradeName || ''} onChange={(e) => set({ tradeName: e.target.value })} className={inputCls} placeholder="Nom affiché sur les documents" />
              </div>
              <div>
                <label className={labelCls}>Nature de l'entité</label>
                <select value={form.type || 'hopital'} onChange={(e) => set({ type: e.target.value as EtablissementType })} className={`${inputCls} bg-white cursor-pointer`}>
                  {ETABLISSEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Forme juridique</label>
                <input value={form.legalForm || ''} onChange={(e) => set({ legalForm: e.target.value })} className={inputCls} placeholder="SA, SARL, Association, ONG…" />
              </div>
            </div>
          </div>

          {/* Identifiants légaux */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <BadgeCheck className="w-4 h-4 text-indigo-600" /> Identifiants légaux, fiscaux & sanitaires
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>NIF</label>
                <input value={form.nif || ''} onChange={(e) => set({ nif: e.target.value })} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>STAT</label>
                <input value={form.stat || ''} onChange={(e) => set({ stat: e.target.value })} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>RCS / Registre du commerce</label>
                <input value={form.rcs || ''} onChange={(e) => set({ rcs: e.target.value })} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>N° d'agrément sanitaire</label>
                <input value={form.numeroAgrement || ''} onChange={(e) => set({ numeroAgrement: e.target.value })} className={`${inputCls} font-mono`} placeholder="Autorisation d'ouverture" />
              </div>
              <div>
                <label className={labelCls}>N° employeur (CNaPS)</label>
                <input value={form.numeroCnaps || ''} onChange={(e) => set({ numeroCnaps: e.target.value })} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label className={labelCls}>Capital social</label>
                <input value={form.capital || ''} onChange={(e) => set({ capital: e.target.value })} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Coordonnées */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-indigo-600" /> Coordonnées
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="lg:col-span-2">
                <label className={labelCls}>Adresse</label>
                <input value={form.address || ''} onChange={(e) => set({ address: e.target.value })} className={inputCls} placeholder="Lot, quartier, rue…" />
              </div>
              <div>
                <label className={labelCls}>Ville</label>
                <input value={form.city || ''} onChange={(e) => set({ city: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Code postal</label>
                <input value={form.postalCode || ''} onChange={(e) => set({ postalCode: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Région / Province</label>
                <input value={form.region || ''} onChange={(e) => set({ region: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Pays</label>
                <input value={form.country || ''} onChange={(e) => set({ country: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Téléphone principal</label>
                <input value={form.phone || ''} onChange={(e) => set({ phone: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Téléphone secondaire</label>
                <input value={form.phone2 || ''} onChange={(e) => set({ phone2: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Fax</label>
                <input value={form.fax || ''} onChange={(e) => set({ fax: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>E-mail</label>
                <input value={form.email || ''} onChange={(e) => set({ email: e.target.value })} className={inputCls} placeholder="contact@etablissement.mg" />
              </div>
              <div>
                <label className={labelCls}>Site web</label>
                <input value={form.website || ''} onChange={(e) => set({ website: e.target.value })} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Représentant légal & banque */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <UserIcon className="w-4 h-4 text-indigo-600" /> Représentant légal
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Nom & prénoms</label>
                  <input value={form.directorName || ''} onChange={(e) => set({ directorName: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Fonction</label>
                  <input value={form.directorTitle || ''} onChange={(e) => set({ directorTitle: e.target.value })} className={inputCls} placeholder="Directeur, Médecin-chef…" />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Téléphone</label>
                  <input value={form.directorPhone || ''} onChange={(e) => set({ directorPhone: e.target.value })} className={inputCls} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <Landmark className="w-4 h-4 text-indigo-600" /> Coordonnées bancaires
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Banque</label>
                  <input value={form.bankName || ''} onChange={(e) => set({ bankName: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>N° de compte / RIB</label>
                  <input value={form.bankAccount || ''} onChange={(e) => set({ bankAccount: e.target.value })} className={`${inputCls} font-mono`} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Observations</label>
                  <input value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className={inputCls} />
                </div>
              </div>
            </div>
          </div>

          {/* Logo & options */}
          <div className="rounded-2xl bg-white border border-slate-200 p-4 space-y-3">
            <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-purple-600" /> Logo & statut
            </h5>
            <div className="flex flex-wrap items-center gap-5">
              <div className="w-20 h-20 border-2 border-dashed border-slate-300 rounded-2xl flex items-center justify-center bg-slate-50 overflow-hidden shrink-0">
                {form.logoUrl
                  ? (form.logoUrl.length <= 5
                    ? <span className="text-3xl">{form.logoUrl}</span>
                    : <img src={form.logoUrl} alt="Logo" className="w-full h-full object-contain p-1.5" />)
                  : <span className="text-[10px] text-slate-400 text-center px-2">Aucun logo</span>}
              </div>
              <div className="flex gap-2">
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogo} className="hidden" />
                <button onClick={() => logoInputRef.current?.click()} className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold cursor-pointer flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Charger un logo
                </button>
                {form.logoUrl && (
                  <button onClick={() => set({ logoUrl: '' })} className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-semibold cursor-pointer border border-rose-200 flex items-center gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Effacer
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={form.active !== false} onChange={(e) => set({ active: e.target.checked })} className="w-4 h-4 cursor-pointer" />
                Établissement actif
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input type="checkbox" checked={!!form.isPrincipal} onChange={(e) => set({ isPrincipal: e.target.checked })} className="w-4 h-4 cursor-pointer" />
                Établissement principal (en-tête des documents)
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={closeForm} className="px-3.5 py-2 bg-slate-200 text-slate-700 rounded-xl cursor-pointer font-semibold text-xs">Annuler</button>
            <button onClick={save} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl cursor-pointer font-bold text-xs flex items-center gap-1.5 shadow-sm">
              <Check className="w-4 h-4" /> {editingId ? 'Enregistrer les modifications' : 'Enregistrer l\'établissement'}
            </button>
          </div>
        </div>
      )}

      {/* Barre de filtres */}
      <div className="bg-white p-3.5 border border-slate-200 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-1.5 border rounded-xl text-xs outline-none"
            placeholder="Rechercher par nom, code, NIF, STAT, ville…"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Nature :</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 border rounded-xl text-xs bg-white cursor-pointer outline-none"
          >
            <option value="all">Toutes ({etablissements.length})</option>
            {ETABLISSEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Table des établissements */}
      <div className="border border-slate-200 rounded-2xl overflow-x-auto bg-white shadow-xs">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-50 border-b text-slate-600 font-bold">
            <tr>
              <th className="p-3.5">Code</th>
              <th className="p-3.5">Raison sociale</th>
              <th className="p-3.5">Nature</th>
              <th className="p-3.5">NIF / STAT</th>
              <th className="p-3.5">Coordonnées</th>
              <th className="p-3.5 text-center">Statut</th>
              <th className="p-3.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y border-slate-100">
            {filtered.map((e) => (
              <tr key={e.id} className={`hover:bg-slate-50/80 transition ${e.active === false ? 'opacity-60' : ''}`}>
                <td className="p-3.5 font-mono font-bold text-slate-700">{e.code || '—'}</td>
                <td className="p-3.5">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    {e.isPrincipal && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500 shrink-0" />}
                    {e.name}
                  </div>
                  {e.tradeName && e.tradeName !== e.name && <div className="text-[11px] text-slate-500">{e.tradeName}</div>}
                  {e.legalForm && <div className="text-[11px] text-slate-400">{e.legalForm}</div>}
                </td>
                <td className="p-3.5">
                  <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-semibold">
                    {etablissementTypeLabel(e.type)}
                  </span>
                </td>
                <td className="p-3.5 font-mono text-[11px] text-slate-600">
                  <div>NIF : {e.nif || '—'}</div>
                  <div>STAT : {e.stat || '—'}</div>
                  {e.numeroAgrement && <div>Agrément : {e.numeroAgrement}</div>}
                </td>
                <td className="p-3.5 text-[11px] text-slate-600 space-y-0.5">
                  <div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" /> {etablissementFullAddress(e) || '—'}</div>
                  {e.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" /> {e.phone}</div>}
                  {e.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3 text-slate-400" /> {e.email}</div>}
                </td>
                <td className="p-3.5 text-center">
                  <button
                    onClick={() => toggleActive(e.id)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer ${
                      e.active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}
                    title="Activer / désactiver"
                  >
                    {e.active !== false ? 'Actif' : 'Inactif'}
                  </button>
                </td>
                <td className="p-3.5 text-right whitespace-nowrap">
                  {!e.isPrincipal && (
                    <button onClick={() => setPrincipal(e.id)} className="text-amber-600 hover:text-amber-700 p-1.5 cursor-pointer rounded-lg hover:bg-amber-50" title="Définir comme établissement principal">
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => applyToDocuments(e)} className="text-emerald-600 hover:text-emerald-800 p-1.5 cursor-pointer rounded-lg hover:bg-emerald-50" title="Reprendre sur les tickets & factures">
                    <Printer className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(e)} className="text-indigo-600 hover:text-indigo-800 p-1.5 cursor-pointer rounded-lg hover:bg-indigo-50" title="Modifier">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setConfirm({ isOpen: true, id: e.id, name: e.name })} className="text-rose-600 hover:text-rose-800 p-1.5 cursor-pointer rounded-lg hover:bg-rose-50" title="Supprimer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                  Aucun établissement enregistré. Cliquez sur « Nouvel établissement » pour identifier la société ou l'hôpital.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        isOpen={confirm.isOpen}
        title="Supprimer cet établissement ?"
        message={`Confirmez-vous la suppression de la fiche « ${confirm.name} » ? Les documents déjà imprimés ne sont pas modifiés.`}
        confirmText="Supprimer la fiche"
        type="danger"
        onConfirm={remove}
        onCancel={() => setConfirm({ isOpen: false, id: '', name: '' })}
      />
    </div>
  );
}
