import React, { useState } from 'react';
import { Users, Plus, Search, Edit3, Trash2, User, Phone, Mail, Calendar, X, Building } from 'lucide-react';
import { Personne, Societe, Famille } from '../types';
import { generateId, formatDate } from '../utils/formatters';
import { maskNom } from '../utils/inputMasks';

interface PersonnesViewProps {
  personnes: Personne[];
  societes: Societe[];
  familles: Famille[];
  selectedSocieteId: string;
  onSavePersonne: (personne: Personne) => void;
  onDeletePersonne: (id: string) => void;
}

export const PersonnesView: React.FC<PersonnesViewProps> = ({
  personnes,
  societes,
  familles,
  selectedSocieteId,
  onSavePersonne,
  onDeletePersonne,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPersonne, setEditingPersonne] = useState<Personne | null>(null);
  const [personneToDelete, setPersonneToDelete] = useState<Personne | null>(null);
  const [formData, setFormData] = useState<Partial<Personne>>({
    nomPrenom: '',
    matricule: '',
    societeId: societes[0]?.id || '',
    qualite: 'Adhérent Principal',
    familleCode: 'CONS',
    dateNaissance: '',
    telephone: '',
    email: '',
  });

  const filtered = personnes.filter(p => {
    const matchesSoc = !selectedSocieteId || selectedSocieteId === 'ALL' || p.societeId === selectedSocieteId;
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      p.nomPrenom.toLowerCase().includes(searchLower) ||
      p.matricule.toLowerCase().includes(searchLower) ||
      (p.qualite || '').toLowerCase().includes(searchLower);
    return matchesSoc && matchesSearch;
  });

  const getSocieteNom = (id: string) => societes.find(s => s.id === id)?.nom || 'Société';

  const handleOpenCreate = () => {
    setEditingPersonne(null);
    setFormData({
      nomPrenom: '',
      matricule: '',
      societeId: (selectedSocieteId && selectedSocieteId !== 'ALL') ? selectedSocieteId : (societes[0]?.id || ''),
      qualite: 'Adhérent Principal',
      familleCode: 'CONS',
      dateNaissance: '',
      telephone: '',
      email: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Personne) => {
    setEditingPersonne(p);
    setFormData({
      ...p,
      nomPrenom: p.nomPrenom || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!editingPersonne && !formData.id) || !formData.nomPrenom?.trim() || !formData.matricule || !formData.societeId) {
      alert('Veuillez renseigner le nom, le matricule et la société.');
      return;
    }

    const toSave: Personne = {
      ...formData,
      id: editingPersonne ? editingPersonne.id : formData.id!,
      nomPrenom: formData.sharedPatient ? formData.nomPrenom.trim() : maskNom(formData.nomPrenom.trim()),
      matricule: formData.matricule!,
      societeId: formData.societeId!,
      qualite: formData.qualite as any || 'Adhérent Principal',
      familleCode: formData.familleCode || 'CONS',
      dateNaissance: formData.dateNaissance,
      telephone: formData.telephone,
      email: formData.email,
    };

    onSavePersonne(toSave);
    setIsModalOpen(false);
  };

  return (
    <div id="personnes-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-ink-strong">Adhérents & Bénéficiaires (Assurés)</h2>
          <p className="text-xs text-ink-muted">
            Fichier des assurés principaux, conjoints, enfants et ayants droit
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvel Adhérent / Assuré</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-surface p-4 rounded-xl border border-line shadow-xs flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink-faint" />
          <input
            type="text"
            placeholder="Rechercher par nom, matricule..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(maskNom(e.target.value))}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-line focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <span className="text-xs text-ink-muted font-medium">{filtered.length} personnes répertoriées</span>
      </div>

      {/* Table of Insured Members */}
      <div className="bg-surface rounded-xl border border-line shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-muted text-ink-secondary uppercase text-[11px] font-semibold border-b border-line">
              <tr>
                <th className="py-3 px-3">Matricule</th>
                <th className="py-3 px-3">Nom & Prénom</th>
                <th className="py-3 px-3">Société d'Affiliation</th>
                <th className="py-3 px-3">Qualité / Rôle</th>
                <th className="py-3 px-3">Date de Naissance</th>
                <th className="py-3 px-3">Contact</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-faint">
                    Aucun assuré trouvé.
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr key={p.id} className="hover:bg-surface-muted transition">
                    <td className="py-3 px-3 font-mono font-bold text-indigo-700">{p.matricule}</td>
                    <td className="py-3 px-3 font-semibold text-ink-strong">{p.nomPrenom}{!p.sharedPatient && <span className="block text-[10px] text-amber-700">Ancien assuré non relié à Réception</span>}</td>
                    <td className="py-3 px-3 text-ink">{getSocieteNom(p.societeId)}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        p.qualite === 'Adhérent Principal'
                          ? 'bg-indigo-100 text-indigo-800'
                          : p.qualite === 'Conjoint'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {p.qualite}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-ink-secondary">{formatDate(p.dateNaissance)}</td>
                    <td className="py-3 px-3 text-ink-muted">{p.telephone || p.email || '-'}</td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => handleOpenEdit(p)}
                          className="p-1.5 text-ink-faint hover:text-indigo-600 rounded-lg hover:bg-indigo-50"
                          title="Modifier"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPersonneToDelete(p)}
                          className="p-1.5 text-ink-faint hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                          title={p.sharedPatient ? 'Dossier protégé : gérer dans Réception' : 'Supprimer'}
                          disabled={p.sharedPatient}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create/Edit Personne */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line-soft pb-3">
              <h3 className="font-bold text-ink-strong text-base">
                {editingPersonne ? 'Modifier l\'Assuré' : 'Nouvel Adhérent / Assuré'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-ink-faint hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              {!editingPersonne && <label className="block font-semibold">Patient de la Réception *
                <select aria-label="Patient de la Réception" required value={formData.id || ''}
                  onChange={event => {
                    const patient = personnes.find(p => p.id === event.target.value);
                    if (patient) setFormData({ ...patient, societeId: formData.societeId || patient.societeId, familleCode: 'CONS' });
                  }} className="mt-1 w-full p-2 border border-line-strong rounded-lg">
                  <option value="">Sélectionner un dossier existant</option>
                  {personnes.filter(p => p.sharedPatient).map(p => <option key={p.id} value={p.id}>{p.dossier} — {p.nomPrenom}</option>)}
                </select>
                <span className="block mt-1 text-ink-muted font-normal">Un nouveau patient se crée dans Réception. Cette action ajoute sa couverture, pas un deuxième dossier.</span>
              </label>}
              <div>
                <label className="block text-ink font-semibold mb-1">Nom & Prénom *</label>
                <input
                  type="text"
                  required
                  readOnly={!!formData.sharedPatient}
                  value={formData.nomPrenom || ''}
                  onChange={(e) => setFormData(p => ({ ...p, nomPrenom: maskNom(e.target.value) }))}
                  className="w-full p-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none uppercase"
                  placeholder="Ex: RAKOTO Jean"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">Matricule / Police *</label>
                  <input
                    type="text"
                    required
                    value={formData.matricule || ''}
                    onChange={(e) => setFormData(p => ({ ...p, matricule: e.target.value }))}
                    className="w-full p-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                    placeholder="MAT-0001"
                  />
                </div>

                <div>
                  <label className="block text-ink font-semibold mb-1">Qualité</label>
                  <select
                    value={formData.qualite || 'Adhérent Principal'}
                    onChange={(e) => setFormData(p => ({ ...p, qualite: e.target.value as any }))}
                    className="w-full p-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="Adhérent Principal">Adhérent Principal</option>
                    <option value="Conjoint">Conjoint</option>
                    <option value="Enfant">Enfant</option>
                    <option value="Ayant droit">Ayant droit</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">Société d'Affiliation *</label>
                <select
                  value={formData.societeId || ''}
                  onChange={(e) => setFormData(p => ({ ...p, societeId: e.target.value }))}
                  className="w-full p-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {societes.map(s => (
                    <option key={s.id} value={s.id}>{s.nom}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-ink font-semibold mb-1">Date de Naissance</label>
                <input
                  type="date"
                  readOnly={!!formData.sharedPatient}
                  value={formData.dateNaissance || ''}
                  onChange={(e) => setFormData(p => ({ ...p, dateNaissance: e.target.value }))}
                  className="w-full p-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-ink font-semibold mb-1">Téléphone</label>
                  <input
                    type="text"
                    value={formData.telephone || ''}
                    onChange={(e) => setFormData(p => ({ ...p, telephone: e.target.value }))}
                    className="w-full p-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="+261 34..."
                  />
                </div>

                <div>
                  <label className="block text-ink font-semibold mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                    className="w-full p-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="email@domaine.mg"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-line-soft">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-line text-ink-secondary hover:bg-surface-hover"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-sm"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmation de Suppression */}
      {personneToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2.5 bg-rose-100 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-ink-strong text-base">Supprimer l'assuré ?</h3>
                <p className="text-[11px] text-ink-muted font-mono">Matricule: {personneToDelete.matricule || 'N/A'}</p>
              </div>
            </div>

            <p className="text-xs text-ink-secondary leading-relaxed">
              Voulez-vous vraiment supprimer l'assuré <strong className="text-ink-strong font-bold">{personneToDelete.nomPrenom}</strong> ?
              Cette action le retirera de votre répertoire d'adhérents.
            </p>

            <div className="flex justify-end space-x-2 pt-3 border-t border-line-soft">
              <button
                type="button"
                onClick={() => setPersonneToDelete(null)}
                className="px-4 py-2 rounded-xl border border-line text-ink-secondary text-xs font-semibold hover:bg-surface-hover transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeletePersonne(personneToDelete.id);
                  setPersonneToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
