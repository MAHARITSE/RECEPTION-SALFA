import React, { useMemo, useState } from 'react';
import { Search, Plus, Trash2, UserX, PackageX, Info, Users, Layers, Ban } from 'lucide-react';
import type { ExclusionSociete, Famille, Personne } from '../../types';
import { generateId } from '../../utils/formatters';
import {
  exclusionsActives,
  libelleExclusion,
  normaliseActeTexte,
  rechercherFamilles,
  rechercherPersonnes,
} from '../../utils/societeExclusions';

interface ExclusionsEditorProps {
  exclusions: ExclusionSociete[];
  onChange: (next: ExclusionSociete[]) => void;
  personnes: Personne[];
  familles: Famille[];
  societeId?: string;
  societeNom?: string;
}

type Onglet = 'personne' | 'famille';

/**
 * Bloc réutilisable de gestion des exclusions d'une société :
 *  - exclusion d'un client / assuré (personne),
 *  - exclusion d'une famille d'articles (ex. ÉCHOGRAPHIE, LABORATOIRE).
 */
export const ExclusionsEditor: React.FC<ExclusionsEditorProps> = ({
  exclusions = [],
  onChange,
  personnes = [],
  familles = [],
  societeId,
  societeNom,
}) => {
  const [onglet, setOnglet] = useState<Onglet>('famille');
  const [recherche, setRecherche] = useState('');

  const personnesExclues = useMemo(() => exclusions.filter(e => e.type === 'personne'), [exclusions]);
  const famillesExclues = useMemo(() => exclusions.filter(e => e.type === 'famille'), [exclusions]);

  const personnesTrouvees = useMemo(
    () => rechercherPersonnes(personnes, societeId, recherche).slice(0, 60),
    [personnes, societeId, recherche],
  );
  const famillesTrouvees = useMemo(() => rechercherFamilles(familles, recherche), [familles, recherche]);

  const dejaExclu = (type: Onglet, key: string) =>
    exclusions.some(e => e.type === type && normaliseActeTexte(keyOf(e, type)) === normaliseActeTexte(key));

  function keyOf(exclusion: ExclusionSociete, type: Onglet): string {
    return type === 'personne'
      ? exclusion.personneId || exclusion.matricule || exclusion.nomPrenom || ''
      : exclusion.familleCode || exclusion.familleLibelle || (exclusion.motsCles || [])[0] || '';
  }

  const ajouter = (exclusion: ExclusionSociete) => {
    if (!exclusion.id) exclusion = { ...exclusion, id: generateId('exc') };
    onChange([...(exclusions || []), exclusion]);
    setRecherche('');
  };

  const retirer = (id: string) => onChange((exclusions || []).filter(e => e.id !== id));

  const majMotif = (id: string, motif: string) =>
    onChange((exclusions || []).map(e => (e.id === id ? { ...e, motif } : e)));

  const ajouterPersonne = (p: Personne) => {
    if (dejaExclu('personne', p.id)) return;
    ajouter({
      id: generateId('exc'),
      type: 'personne',
      personneId: p.id,
      nomPrenom: p.nomPrenom,
      matricule: p.matricule,
      tauxPriseEnCharge: 0,
      actif: true,
      dateAjout: new Date().toISOString().split('T')[0],
    });
  };

  const ajouterFamille = (f: Famille) => {
    if (dejaExclu('famille', f.code)) return;
    ajouter({
      id: generateId('exc'),
      type: 'famille',
      familleCode: f.code,
      familleLibelle: f.libelle,
      motsCles: [...(f.aliases || []), f.libelle].filter(Boolean).slice(0, 12),
      tauxPriseEnCharge: 0,
      actif: true,
      dateAjout: new Date().toISOString().split('T')[0],
    });
  };

  const ajouterLibre = () => {
    const libelle = recherche.trim();
    if (!libelle) return;
    if (dejaExclu('famille', libelle)) return;
    ajouter({
      id: generateId('exc'),
      type: 'famille',
      familleCode: normaliseActeTexte(libelle).replace(/\s+/g, '_').slice(0, 20),
      familleLibelle: libelle.toUpperCase(),
      motsCles: [libelle, normaliseActeTexte(libelle)],
      tauxPriseEnCharge: 0,
      actif: true,
      dateAjout: new Date().toISOString().split('T')[0],
    });
  };

  const termeNormalise = normaliseActeTexte(recherche);
  const aucuneFamilleExacte = termeNormalise.length >= 3 && !famillesTrouvees.some(f =>
    normaliseActeTexte(f.code) === termeNormalise || normaliseActeTexte(f.libelle) === termeNormalise);

  const lignes = onglet === 'personne' ? personnesExclues : famillesExclues;

  return (
    <div className="space-y-3" data-testid="exclusions-editor">
      <div className="flex items-start space-x-2 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-900">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
        <p className="leading-relaxed">
          Une exclusion <strong>bloque la prise en charge par {societeNom || 'la société'}</strong> : l'assuré ou la famille
          d'articles exclu(e) n'est pas remboursé(e). S'il faut malgré tout prescrire l'acte, le patient doit être
          facturé en <strong>client comptoir</strong>.
        </p>
      </div>

      {/* Onglets */}
      <div className="flex items-center space-x-1 p-1 bg-surface-muted rounded-xl border border-line">
        <button
          type="button"
          onClick={() => { setOnglet('famille'); setRecherche(''); }}
          className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
            onglet === 'famille' ? 'bg-surface text-rose-700 shadow-xs' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <PackageX className="w-3.5 h-3.5" />
          <span>Familles d'articles ({famillesExclues.length})</span>
        </button>
        <button
          type="button"
          onClick={() => { setOnglet('personne'); setRecherche(''); }}
          className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition cursor-pointer ${
            onglet === 'personne' ? 'bg-surface text-rose-700 shadow-xs' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <UserX className="w-3.5 h-3.5" />
          <span>Personnes clientes ({personnesExclues.length})</span>
        </button>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink-faint" />
        <input
          type="text"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder={onglet === 'personne'
            ? 'Rechercher un assuré (nom, matricule, sous-société)...'
            : 'Ex: ÉCHOGRAPHIE, LABORATOIRE, PHARMACIE...'}
          className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-rose-400 bg-surface"
        />
      </div>

      {/* Suggestions */}
      {recherche.trim().length > 0 && (
        <div className="max-h-52 overflow-y-auto space-y-1 border border-line rounded-xl p-1.5 bg-surface-muted">
          {onglet === 'personne' && personnesTrouvees.map(p => {
            const exclu = dejaExclu('personne', p.id);
            return (
              <button
                key={p.id}
                type="button"
                disabled={exclu}
                onClick={() => ajouterPersonne(p)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition cursor-pointer ${
                  exclu ? 'opacity-50 cursor-not-allowed' : 'hover:bg-rose-50 text-ink'
                }`}
              >
                <span className="flex items-center space-x-2 truncate">
                  <Users className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                  <span className="font-semibold truncate">{p.nomPrenom}</span>
                  <span className="text-ink-faint font-mono">{p.matricule || '—'}</span>
                  {p.qualite && <span className="text-[10px] text-ink-faint">({p.qualite})</span>}
                </span>
                <span className="text-[10px] font-bold text-rose-600 shrink-0">
                  {exclu ? 'Déjà exclu' : 'Exclure'}
                </span>
              </button>
            );
          })}

          {onglet === 'personne' && personnesTrouvees.length === 0 && (
            <p className="p-3 text-center text-[11px] text-ink-muted">Aucun assuré ne correspond à cette recherche.</p>
          )}

          {onglet === 'famille' && famillesTrouvees.map(f => {
            const exclu = dejaExclu('famille', f.code);
            return (
              <button
                key={f.id || f.code}
                type="button"
                disabled={exclu}
                onClick={() => ajouterFamille(f)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] transition cursor-pointer ${
                  exclu ? 'opacity-50 cursor-not-allowed' : 'hover:bg-rose-50 text-ink'
                }`}
              >
                <span className="flex items-center space-x-2 truncate">
                  <Layers className="w-3.5 h-3.5 text-ink-faint shrink-0" />
                  <span className="font-mono font-bold text-rose-700">{f.code}</span>
                  <span className="truncate">{f.libelle}</span>
                </span>
                <span className="text-[10px] font-bold text-rose-600 shrink-0">
                  {exclu ? 'Déjà exclue' : 'Exclure'}
                </span>
              </button>
            );
          })}

          {onglet === 'famille' && aucuneFamilleExacte && (
            <button
              type="button"
              onClick={ajouterLibre}
              className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-[11px] hover:bg-rose-50 text-ink transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>Ajouter « <strong>{recherche.trim().toUpperCase()}</strong> » comme exclusion libre</span>
            </button>
          )}

          {onglet === 'famille' && famillesTrouvees.length === 0 && !aucuneFamilleExacte && (
            <p className="p-3 text-center text-[11px] text-ink-muted">Aucune famille d'articles ne correspond.</p>
          )}
        </div>
      )}

      {/* Liste des exclusions enregistrées */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold text-ink flex items-center space-x-1.5">
            <Ban className="w-3.5 h-3.5 text-rose-500" />
            <span>{lignes.length} exclusion(s) {onglet === 'personne' ? 'de personnes' : "de familles d'articles"}</span>
          </span>
          {exclusionsActives({ exclusions }).length !== exclusions.length && (
            <span className="text-[10px] text-ink-faint">certaines règles sont désactivées</span>
          )}
        </div>

        {lignes.length === 0 ? (
          <div className="p-5 text-center bg-surface-muted rounded-xl border border-dashed border-line-strong text-[11px] text-ink-muted">
            {onglet === 'personne'
              ? 'Aucune personne cliente exclue. Recherchez un assuré ci-dessus pour le bloquer.'
              : "Aucune famille d'articles exclue. Tapez par exemple « ÉCHOGRAPHIE » ou « LABORATOIRE »."}
          </div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {lignes.map(e => (
              <div key={e.id} className="flex items-center gap-2 p-2 rounded-xl border border-rose-200 bg-rose-50/60">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-ink-strong truncate">
                    {onglet === 'famille' && e.familleCode && (
                      <span className="font-mono text-rose-700 mr-1.5">[{e.familleCode}]</span>
                    )}
                    {libelleExclusion(e)}
                  </p>
                  <p className="text-[10px] text-ink-faint">
                    0 % pris en charge — à facturer en client comptoir
                    {e.matricule ? ` • Mat. ${e.matricule}` : ''}
                  </p>
                </div>
                <input
                  type="text"
                  value={e.motif || ''}
                  onChange={(ev) => majMotif(e.id, ev.target.value)}
                  placeholder="Motif (facultatif)"
                  className="w-40 p-1 text-[10px] rounded-lg border border-line-strong focus:outline-none focus:ring-1 focus:ring-rose-400 bg-surface"
                />
                <button
                  type="button"
                  onClick={() => retirer(e.id)}
                  className="p-1.5 text-rose-500 hover:bg-rose-100 rounded-lg transition cursor-pointer"
                  title="Retirer l'exclusion"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
