import { useState, useCallback, useMemo, useEffect } from 'react';
import { Societe, Personne, Famille, Prestation, Paiement, EnteteConfig, ActiveTab, defaultEnteteConfig } from './types';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { BillingWorkspace } from './components/BillingWorkspace';
import { PaiementsView } from './components/PaiementsView';
import { RejetsView } from './components/RejetsView';
import type { RejetDetail } from './components/RejetsView';
import { HistoriqueView } from './components/HistoriqueView';
import { SocietesView } from './components/SocietesView';
import { PersonnesView } from './components/PersonnesView';
import { FamillesView } from './components/FamillesView';
import { EtatsView } from './components/EtatsView';
import { EnteteView } from './components/EnteteView';
import { readSharedTable, writeSharedTable, sharedTransactions, sharedSocietes, sharedPersonnes, sharedFamilles, fusionnerPrescription, annulerFusionPrescription } from './sharedData';
import { getCurrentTimestamp } from './utils/formatters';
import type { AppState } from '../../store';
import { addAuditLog } from '../../store';
import { setCurrentEnteteConfig, readLegacyEnteteConfig } from './utils/enteteStorage';
import { Building2, Filter, RotateCcw } from 'lucide-react';
import { IS_WAMP_BUILD } from '../../wamp';
import { linkSharedReferences } from './linkReferences';
import { reconcilePrestationsWithPaiements } from './utils/reconcile';

type Props = { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> };

export default function ModuleSuiviAssurance({ state, setState }: Props) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  useEffect(() => { if (!IS_WAMP_BUILD || state.assuranceStorageSupported) setState(prev => linkSharedReferences(prev)); }, [state.companies, state.patients, state.assuranceSocietes, state.assurancePersonnes, state.assuranceStorageSupported, setState]);

  const [selectedSocieteId, setSelectedSocieteId] = useState('ALL');
  const [selectedSubSocieteId, setSelectedSubSocieteId] = useState('ALL');
  const enteteConfig = useMemo(() => state.ticketSettings.assuranceHeader || {
    ...defaultEnteteConfig, etablissement: state.ticketSettings.facilityName,
    adresse: state.ticketSettings.address, telephone: state.ticketSettings.phone,
    email: state.ticketSettings.email || '', nifStat: state.ticketSettings.nif,
    logoUrl: state.ticketSettings.logoUrl,
  }, [state.ticketSettings]);
  setCurrentEnteteConfig(enteteConfig);
  const setEnteteConfig = (config: EnteteConfig) => {
    assertWritable();
    setState(prev => ({ ...prev, ticketSettings: { ...prev.ticketSettings, assuranceHeader: config } }));
  };
  useEffect(() => {
    if (state.ticketSettings.assuranceHeader || (IS_WAMP_BUILD && !state.assuranceStorageSupported)) return;
    const legacy = readLegacyEnteteConfig();
    if (legacy) setState(prev => prev.ticketSettings.assuranceHeader ? prev : ({ ...prev, ticketSettings: { ...prev.ticketSettings, assuranceHeader: legacy } }));
  }, [state.ticketSettings.assuranceHeader, state.assuranceStorageSupported, setState]);
  const societes = useMemo(() => sharedSocietes(state), [state.companies, state.assuranceSocietes]);
  const personnes = useMemo(() => sharedPersonnes(state), [state.patients, state.companies, state.assurancePersonnes, state.assuranceSocietes]);
  const familles = useMemo(() => sharedFamilles(state), [state.familles, state.assuranceFamilles]);
  const { prestations, paiements } = useMemo(() => sharedTransactions(state), [state]);

  // All views use Reception's identities and invoices. Supplemental insurance
  // rows are stored alongside them, in the host database and backup.
  function tableSetter<K extends 'assuranceSocietes' | 'assurancePersonnes' | 'assuranceFamilles' | 'assurancePrestations' | 'assurancePaiements'>(key: K) {
    return (action: React.SetStateAction<NonNullable<AppState[K]>>) => {
      assertWritable();
      const apply = (prev: AppState) => {
        const current = readSharedTable(prev, key) as NonNullable<AppState[K]>;
        return writeSharedTable(prev, key, typeof action === 'function' ? action(current) : action);
      };
      apply(state); // Validate in the event handler, before scheduling any write.
      setState(prev => {
        const next = { ...apply(prev), auditLogs: [...prev.auditLogs] };
        addAuditLog(next, 'SUIVI_ASSURANCE', `Base commune : mise à jour ${key}`);
        return next;
      });
    };
  }
  const setSocietes = tableSetter('assuranceSocietes');
  const setPersonnes = tableSetter('assurancePersonnes');
  const setFamilles = tableSetter('assuranceFamilles');
  const setPrestations = tableSetter('assurancePrestations');
  const setPaiements = tableSetter('assurancePaiements');
  // Computed values for selected societe and sub-societe filter
  const selectedSociete = societes.find(s => s.id === selectedSocieteId);

  // Collect unique sub-societies / services for the selected societe
  const availableSubSocietes = Array.from(
    new Set([
      ...(selectedSociete?.sousSocietes || []),
      ...prestations.filter(p => p.societeId === selectedSocieteId && p.sousSociete?.trim()).map(p => p.sousSociete.trim()),
      ...personnes.filter(p => p.societeId === selectedSocieteId && p.sousSociete?.trim()).map(p => p.sousSociete!.trim())
    ])
  ).filter(Boolean).sort();

  const selectedSubSociete = selectedSubSocieteId !== 'ALL' ? selectedSubSocieteId : undefined;

  // Modals quick trigger
  const [isPrestationModalOpen, setIsPrestationModalOpen] = useState(false);
  const [isPaiementModalOpen, setIsPaiementModalOpen] = useState(false);

  function assertWritable() {
    if (IS_WAMP_BUILD && !state.assuranceStorageSupported) throw new Error('Lecture seule : l’API de la base Réception doit être mise à jour pour conserver les compléments assurance. Aucune autre base n’est nécessaire.');
  }
  const commitChange = (change: (current: AppState) => AppState) => {
    assertWritable();
    change(state); // fail before any state update, including multi-table imports
    setState(prev => {
      const next = { ...change(prev), auditLogs: [...prev.auditLogs] };
      addAuditLog(next, 'SUIVI_ASSURANCE', 'Mise à jour atomique de la base commune');
      return next;
    });
  };
  const mergeRows = <T extends { id: string }>(base: T[], incoming: T[] = []): T[] => {
    const map = new Map(base.map(row => [row.id, row]));
    incoming.forEach(row => map.set(row.id, row));
    return [...map.values()];
  };
  const savePaymentChanges = (nextPaiements: Paiement[], nextPrestations: Prestation[]) => {
    commitChange(prev => {
      const withPrestations = writeSharedTable(prev, 'assurancePrestations', nextPrestations);
      return writeSharedTable(withPrestations, 'assurancePaiements', nextPaiements);
    });
  };

  // Handlers for Prestations
  const handleSavePrestation = async (prestation: Prestation) => {
    try {

      setPrestations(prev => {
        const idx = prev.findIndex(p => p.id === prestation.id);
        const updated = idx >= 0 ? [...prev] : [prestation, ...prev];
        if (idx >= 0) updated[idx] = prestation;
        return updated;
      });
    } catch (err: any) {
      alert(`Erreur d'enregistrement : ${err.message || err}`);
    }
  };

  /** Fusion du facturier : une prescription liée à une facture Caisse absorbe
   * une autre prescription de la même société (patient revenu deux fois). */
  const handleFusionPrescription = (supprimee: Prestation, conserveId: string, libelle?: string) => {
    try {
      commitChange(prev => {
        const courantes = sharedTransactions(prev).prestations;
        const fusionnees = fusionnerPrescription(courantes, supprimee, conserveId, libelle);
        return writeSharedTable(prev, 'assurancePrestations', fusionnees);
      });
    } catch (err: any) {
      alert(`Fusion impossible : ${err.message || err}`);
    }
  };

  /** Annule la dernière fusion d'une prescription et restitue l'absorbée. */
  const handleAnnulerFusion = (conserveId: string) => {
    try {
      commitChange(prev => {
        const courantes = sharedTransactions(prev).prestations;
        const { prestations: next } = annulerFusionPrescription(courantes, conserveId);
        return writeSharedTable(prev, 'assurancePrestations', next);
      });
    } catch (err: any) {
      alert(`Annulation impossible : ${err.message || err}`);
    }
  };

  const handleDeletePrestation = async (id: string) => {
    try {

      setPrestations(prev => {
        const updated = prev.filter(p => p.id !== id);
        return updated;
      });
    } catch (err: any) {
      alert(`Erreur de suppression : ${err.message || err}`);
    }
  };

  const handleDeleteFacture = async (numeroFacture: string) => {
    try {
      const cleanNum = (n: string) => (n || '').replace(/[\s\-\_\.\/]/g, '').toUpperCase();
      const target = cleanNum(numeroFacture);

      setPrestations(prev => {
        const updated = prev.filter(p => cleanNum(p.numeroFacture) !== target);
        return updated;
      });
    } catch (err: any) {
      alert(`Erreur de suppression de la facture : ${err.message || err}`);
    }
  };

  // Fusionne d'éventuelles nouvelles prestations puis recalcule TOUT à partir des paiements
  const mergeAndReconcile = useCallback((
    basePrestations: Prestation[],
    incoming: Prestation[] | undefined,
    nextPaiements: Paiement[]
  ): Prestation[] => {
    const merged = [...basePrestations];
    (incoming || []).forEach(up => {
      const idx = merged.findIndex(p => p.id === up.id);
      if (idx >= 0) {
        // On garde les données de base (montants facturés, lignes) et on laisse
        // la réconciliation recalculer les montants payés / exclus / statuts.
        merged[idx] = { ...merged[idx], ...up };
      } else {
        merged.unshift(up);
      }
    });
    return reconcilePrestationsWithPaiements(merged, nextPaiements);
  }, [reconcilePrestationsWithPaiements]);

  // Handlers for Paiements
  const handleSavePaiement = async (newPaiement: Paiement, updatedPrestations: Prestation[]) => {
    try {
      const existingPaiement = paiements.find(p => p.id === newPaiement.id);
      // La référence de saisie est créée une seule fois, puis conservée lors
      // des opérations ultérieures (par exemple le rattachement d'une ligne).
      const paiementToSave: Paiement = {
        ...newPaiement,
        dateSaisie: existingPaiement?.dateSaisie || newPaiement.dateSaisie || getCurrentTimestamp(),
      };

      const nextPaiements = (() => {
        const idx = paiements.findIndex(p => p.id === paiementToSave.id);
        if (idx >= 0) {
          const copy = [...paiements];
          copy[idx] = paiementToSave;
          return copy;
        }
        return [paiementToSave, ...paiements];
      })();

      // Recalcul systématique des prestations & lignes_prestation à partir
      // de l'intégralité des règlements (ajout, modification ET suppression de lignes).
      const reconciled = mergeAndReconcile(prestations, updatedPrestations, nextPaiements);

      savePaymentChanges(nextPaiements, reconciled);

    } catch (err: any) {
      alert(`Erreur d'enregistrement du paiement : ${err.message || err}`);
    }
  };

  const handleDeletePaiement = async (id: string) => {
    try {

      const remainingPaiements = paiements.filter(p => p.id !== id);
      const reconciled = reconcilePrestationsWithPaiements(prestations, remainingPaiements);
      savePaymentChanges(remainingPaiements, reconciled);

    } catch (err: any) {
      alert(`Erreur de suppression du paiement : ${err.message || err}`);
    }
  };

  // Suppression réelle d'un rejet : remet à zéro les montants exclus sur les
  // règlements sources et/ou réinitialise le statut 'Rejeté' porté directement
  // sur la prestation, puis recalcule l'ensemble des prestations.
  const handleDeleteRejet = async (rejet: RejetDetail) => {
    try {
      // 1. Identifier les lignes de règlement portant l'exclusion.
      //    Sources exactes collectées par la vue Rejets ; à défaut, on retombe
      //    sur un appariement prestation + acte.
      const sourceKeys = new Set(
        (rejet.sources || []).map((s) => `${s.paiementId}|${s.lignePaiementId}`)
      );

      if (sourceKeys.size === 0) {
        paiements.forEach((pm) => {
          (pm.lignes || []).forEach((lp) => {
            if (!(Number(lp.montantExclu || 0) > 0)) return;
            const byPrestation = !!rejet.prestationId && lp.prestationId === rejet.prestationId;
            const byFacture =
              !!rejet.numeroFacture &&
              !!lp.prestationNumero &&
              lp.prestationNumero.trim().toLowerCase() === rejet.numeroFacture.trim().toLowerCase();
            const byActe = (lp.codeActe || 'EXCLU') === rejet.codeActe;
            if ((byPrestation || byFacture) && byActe) {
              sourceKeys.add(`${pm.id}|${lp.id}`);
            }
          });
        });
      }

      // 2. Remettre à zéro les montants exclus sur les lignes concernées
      //    et recalculer les totaux des bordereaux modifiés.
      const changedPaiements: Paiement[] = [];
      const nextPaiements = paiements.map((pm) => {
        let touched = false;
        const nextLignes = (pm.lignes || []).map((lp) => {
          if (Number(lp.montantExclu || 0) > 0 && sourceKeys.has(`${pm.id}|${lp.id}`)) {
            touched = true;
            return { ...lp, montantExclu: 0 };
          }
          return lp;
        });
        if (!touched) return pm;

        const updated: Paiement = {
          ...pm,
          lignes: nextLignes,
          totalExclu: nextLignes.reduce((s, l) => s + Number(l.montantExclu || 0), 0),
        };
        changedPaiements.push(updated);
        return updated;
      });

      // 3. Nettoyer les traces de rejet portées directement sur la prestation
      //    (statut 'Rejeté' saisi manuellement ou à l'import, montants exclus,
      //    motifs). La réconciliation recalculera le reste à partir des
      //    règlements mis à jour.
      let basePrestations = prestations;
      if (rejet.type !== 'exclusion_decompte' && rejet.prestationId) {
        basePrestations = prestations.map((p) => {
          if (p.id !== rejet.prestationId) return p;

          if (rejet.type === 'prestation_complete') {
            return {
              ...p,
              statut: (p.statut === 'Rejeté' ? 'En attente' : p.statut) as Prestation['statut'],
              montantExclu: 0,
              motifExclusion: undefined,
              lignes: (p.lignes || []).map((l) =>
                l.statut === 'Rejeté'
                  ? { ...l, statut: 'En attente' as const, montantExclu: 0, motifExclusion: undefined }
                  : l
              ),
            };
          }

          // Acte isolé : on ne réinitialise que la ligne concernée
          const lignesNettoyees = (p.lignes || []).map((l) =>
            l.statut === 'Rejeté' && (l.code === rejet.codeActe || (!l.code && rejet.codeActe === 'ACTE'))
              ? { ...l, statut: 'En attente' as const, montantExclu: 0, motifExclusion: undefined }
              : l
          );
          const encoreRejete = lignesNettoyees.some((l) => l.statut === 'Rejeté');
          return {
            ...p,
            lignes: lignesNettoyees,
            statut: (p.statut === 'Rejeté' && !encoreRejete ? 'En attente' : p.statut) as Prestation['statut'],
            motifExclusion: encoreRejete ? p.motifExclusion : undefined,
            montantExclu: encoreRejete ? p.montantExclu : 0,
          };
        });
      }

      // 4. Recalcul systématique des prestations à partir des règlements à jour.
      const reconciled = reconcilePrestationsWithPaiements(basePrestations, nextPaiements);

      savePaymentChanges(nextPaiements, reconciled);

    } catch (err: any) {
      alert(`Erreur lors de la suppression du rejet : ${err.message || err}`);
    }
  };

  // Handlers for Societes
  const handleSaveSociete = async (societe: Societe) => {
    try {

      setSocietes(prev => {
        const idx = prev.findIndex(s => s.id === societe.id);
        const updated = idx >= 0 ? [...prev] : [...prev, societe];
        if (idx >= 0) updated[idx] = societe;
        return updated;
      });
    } catch (err: any) {
      alert(`Erreur enregistrement société : ${err.message || err}`);
    }
  };

  const handleDeleteSociete = async (id: string) => {
    try {

      setSocietes(prev => {
        const updated = prev.filter(s => s.id !== id);
        return updated;
      });
    } catch (err: any) {
      alert(`Erreur suppression société : ${err.message || err}`);
    }
  };

  // Handler for Regrouping / Merging Sub-Societés
  const handleMergeSubSocietes = async (
    societeId: string,
    sourceNames: string[],
    targetName: string
  ) => {
    const cleanTarget = targetName.trim();
    if (!cleanTarget || sourceNames.length === 0) return;

    const normalizedSources = sourceNames.map(s => s.toLowerCase().trim());

    // Find matching societe object to handle both id and name comparisons
    const targetSocObj = societes.find(s => s.id === societeId);
    const socNameLower = targetSocObj ? targetSocObj.nom.toLowerCase().trim() : '';

    // 1. Update Prestations
    const updatedPrestations: Prestation[] = [];
    const nextPrestations = prestations.map(p => {
      const pSocId = (p.societeId || '').toLowerCase().trim();
      const pSocNom = (p.societeNom || '').toLowerCase().trim();
      const matchesSoc = pSocId === societeId.toLowerCase() || (socNameLower && pSocNom === socNameLower);

      if (matchesSoc && p.sousSociete && normalizedSources.includes(p.sousSociete.toLowerCase().trim())) {
        const up = { ...p, sousSociete: cleanTarget };
        updatedPrestations.push(up);
        return up;
      }
      return p;
    });

    // 2. Update Personnes
    const updatedPersonnes: Personne[] = [];
    const nextPersonnes = personnes.map(p => {
      const pSocId = (p.societeId || '').toLowerCase().trim();
      const matchesSoc = pSocId === societeId.toLowerCase();

      if (matchesSoc && p.sousSociete && normalizedSources.includes(p.sousSociete.toLowerCase().trim())) {
        const up = { ...p, sousSociete: cleanTarget };
        updatedPersonnes.push(up);
        return up;
      }
      return p;
    });

    // 3. Update Societe's sousSocietes list
    let updatedSociete: Societe | null = null;
    if (targetSocObj) {
      const existingList = targetSocObj.sousSocietes || [];
      const filteredList = existingList.filter(s => !normalizedSources.includes(s.toLowerCase().trim()));
      if (!filteredList.some(s => s.toLowerCase().trim() === cleanTarget.toLowerCase())) {
        filteredList.push(cleanTarget);
      }
      filteredList.sort();
      updatedSociete = { ...targetSocObj, sousSocietes: filteredList };
    }

    try {

      if (updatedPrestations.length > 0) {
        setPrestations(nextPrestations);
      }
      if (updatedPersonnes.length > 0) {
        setPersonnes(nextPersonnes);
      }
      if (updatedSociete) {
        setSocietes(prev => {
          const updated = prev.map(s => s.id === societeId ? updatedSociete! : s);
          return updated;
        });
      }

    } catch (err: any) {
      alert(`Erreur lors du regroupement des sous-sociétés : ${err.message || err}`);
    }
  };

  // Handlers for Personnes
  const handleSavePersonne = async (personne: Personne) => {
    try {

      setPersonnes(prev => {
        const idx = prev.findIndex(p => p.id === personne.id);
        const updated = idx >= 0 ? [...prev] : [...prev, personne];
        if (idx >= 0) updated[idx] = personne;
        return updated;
      });
    } catch (err: any) {
      alert(`Erreur enregistrement adhérent : ${err.message || err}`);
    }
  };

  const handleDeletePersonne = async (id: string) => {
    try {

      setPersonnes(prev => {
        const updated = prev.filter(p => p.id !== id);
        return updated;
      });
    } catch (err: any) {
      alert(`Erreur suppression adhérent : ${err.message || err}`);
    }
  };

  // Handlers for Familles
  const handleSaveFamille = async (famille: Famille) => {
    try {

      setFamilles(prev => {
        const idx = prev.findIndex(f => f.id === famille.id);
        const updated = idx >= 0 ? [...prev] : [...prev, famille];
        if (idx >= 0) updated[idx] = famille;
        return updated;
      });
    } catch (err: any) {
      alert(`Erreur enregistrement famille : ${err.message || err}`);
    }
  };

  const handleDeleteFamille = async (id: string) => {
    try {

      setFamilles(prev => {
        const updated = prev.filter(f => f.id !== id);
        return updated;
      });
    } catch (err: any) {
      alert(`Erreur suppression famille : ${err.message || err}`);
    }
  };

  // Validate all imported references before committing any table.
  const handleImportPrestations = async (newPrestations: Prestation[], newSocietes: Societe[] = [], newPersonnes: Personne[] = []) => {
    try {
      commitChange(prev => {
        let next = writeSharedTable(prev, 'assuranceSocietes', mergeRows(sharedSocietes(prev), newSocietes));
        next = writeSharedTable(next, 'assurancePersonnes', mergeRows(sharedPersonnes(next), newPersonnes));
        return writeSharedTable(next, 'assurancePrestations', mergeRows(sharedTransactions(next).prestations, newPrestations));
      });
      setActiveTab('prestations');
    } catch (err) { alert(`Import non enregistré : ${(err as Error).message}`); }
  };

  const handleImportPaiements = async (newPaiement: Paiement, updatedPrestations: Prestation[], newSocietes: Societe[] = [], newPersonnes: Personne[] = []) => {
    try {
      commitChange(prev => {
        let next = writeSharedTable(prev, 'assuranceSocietes', mergeRows(sharedSocietes(prev), newSocietes));
        next = writeSharedTable(next, 'assurancePersonnes', mergeRows(sharedPersonnes(next), newPersonnes));
        next = writeSharedTable(next, 'assurancePrestations', mergeRows(sharedTransactions(next).prestations, updatedPrestations));
        return writeSharedTable(next, 'assurancePaiements', mergeRows(sharedTransactions(next).paiements, [{ ...newPaiement, dateSaisie: newPaiement.dateSaisie || getCurrentTimestamp() }]));
      });
      setActiveTab('paiements');
    } catch (err) { alert(`Import non enregistré : ${(err as Error).message}`); }
  };

  return (
    <div className="assurance-module flex min-h-[60vh] flex-col bg-surface-muted text-ink-strong antialiased rounded-xl border border-line">
      {IS_WAMP_BUILD && !state.assuranceStorageSupported && <div role="status" className="m-4 p-4 rounded-xl border border-amber-400 bg-amber-50 text-amber-950">
        <strong>Base Réception — lecture seule pour le suivi assurance</strong>
        <p>Les données communes sont affichées. L’API MySQL de l’application doit conserver les compléments assurance avant d’autoriser les saisies. Aucune base séparée à créer.</p>
      </div>}
      {/* BANDEAU DU FILTRE AVANCÉ : SOCIÉTÉ / GARANT (TRANSPARENT, ANCRÉ À GAUCHE) */}
      <div id="advanced-filter-banner" className="bg-transparent text-ink-strong border-b border-line px-4 py-2.5 sm:px-6 lg:px-8 relative z-20">
        <div className="max-w-7xl flex flex-col md:flex-row md:items-center justify-start gap-4 md:gap-8">
          
          {/* Intitulé et statut */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="p-2 rounded-xl bg-indigo-100/80 border border-indigo-200 text-indigo-700 shadow-xs">
              <Filter className="w-4.5 h-4.5 text-indigo-600" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-ink-strong">
                  Filtre Avancé
                </span>
                {selectedSocieteId !== 'ALL' ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-xs">
                    Filtre actif
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-active/70 text-ink border border-line-strong">
                    Vue Globale (Tous les Garants)
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-ink-secondary mt-0.5">
                Périmètre : <strong className="text-ink-strong">{selectedSociete ? selectedSociete.nom : 'Tous les Garants'}</strong>
              </p>
            </div>
          </div>

          {/* Formulaire des Sélecteurs */}
          <div className="flex flex-wrap items-center gap-2">
            {/* 1. Sélecteur Société / Garant */}
            <div className="flex items-center bg-surface rounded-xl p-1 border border-line-strong shadow-xs">
              <span className="text-[11px] font-bold text-ink px-2 flex items-center gap-1.5 whitespace-nowrap">
                <Building2 className="w-3.5 h-3.5 text-rose-600" />
                Société / Garant :
              </span>
              <select
                id="select-filter-societe"
                aria-label="Société / Garant"
                value={selectedSocieteId}
                onChange={(e) => {
                  setSelectedSocieteId(e.target.value);
                  setSelectedSubSocieteId('ALL');
                }}
                className="bg-surface-muted text-ink-strong text-xs font-bold rounded-lg px-2.5 py-1.5 border border-line-strong focus:outline-none focus:ring-2 focus:ring-indigo-500 hover:border-slate-400 cursor-pointer"
              >
                <option value="ALL">Tous les Garants ({societes.length})</option>
                {societes.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.nom} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Bouton Réinitialiser */}
            {selectedSocieteId !== 'ALL' && (
              <button
                id="btn-reset-filter"
                type="button"
                onClick={() => {
                  setSelectedSocieteId('ALL');
                  setSelectedSubSocieteId('ALL');
                }}
                className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold transition flex items-center space-x-1 cursor-pointer shadow-xs"
                title="Réinitialiser pour afficher tous les garants"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Réinitialiser</span>
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Navigation Tab Bar */}
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content Area */}
      <div className="w-full min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        {activeTab === 'dashboard' && (
          <Dashboard
            prestations={prestations}
            paiements={paiements}
            societes={societes}
            personnes={personnes}
            selectedSocieteId={selectedSocieteId}
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenNewPrestation={() => {
              setActiveTab('prestations');
              setIsPrestationModalOpen(true);
            }}
            onOpenNewPaiement={() => {
              setActiveTab('paiements');
              setIsPaiementModalOpen(true);
            }}
          />
        )}

        {activeTab === 'prestations' && (
          <BillingWorkspace
            state={state}
            setState={setState}
            prestations={prestations}
            paiements={paiements}
            societes={societes}
            personnes={personnes}
            familles={familles}
            selectedSocieteId={selectedSocieteId}
            selectedSubSocieteId={selectedSubSocieteId}
            onSavePrestation={handleSavePrestation}
            onDeletePrestation={handleDeletePrestation}
            onFusionPrescription={handleFusionPrescription}
            onAnnulerFusion={handleAnnulerFusion}
            onDeleteFacture={handleDeleteFacture}
            onImportPrestations={handleImportPrestations}
            onSavePaiement={handleSavePaiement}
            isCreateModalOpen={isPrestationModalOpen}
            setIsCreateModalOpen={setIsPrestationModalOpen}
          />
        )}

        {activeTab === 'paiements' && (
          <PaiementsView
            paiements={paiements}
            prestations={prestations}
            societes={societes}
            personnes={personnes}
            familles={familles}
            selectedSocieteId={selectedSocieteId}
            onSavePaiement={handleSavePaiement}
            onDeletePaiement={handleDeletePaiement}
            onImportPaiements={handleImportPaiements}
            isCreateModalOpen={isPaiementModalOpen}
            setIsCreateModalOpen={setIsPaiementModalOpen}
          />
        )}

        {activeTab === 'rejets' && (
          <RejetsView
            prestations={prestations}
            paiements={paiements}
            societes={societes}
            personnes={personnes}
            familles={familles}
            selectedSocieteId={selectedSocieteId}
            onSavePrestation={handleSavePrestation}
            onDeleteRejet={handleDeleteRejet}
          />
        )}

        {activeTab === 'historique' && (
          <HistoriqueView
            paiements={paiements}
            societes={societes}
            selectedSocieteId={selectedSocieteId}
          />
        )}

        {activeTab === 'societes' && (
          <SocietesView
            societes={societes}
            prestations={prestations}
            personnes={personnes}
            familles={familles}
            onSaveSociete={handleSaveSociete}
            onDeleteSociete={handleDeleteSociete}
            onMergeSubSocietes={handleMergeSubSocietes}
          />
        )}

        {activeTab === 'personnes' && (
          <PersonnesView
            personnes={personnes}
            societes={societes}
            familles={familles}
            selectedSocieteId={selectedSocieteId}
            onSavePersonne={handleSavePersonne}
            onDeletePersonne={handleDeletePersonne}
          />
        )}

        {activeTab === 'familles' && (
          <FamillesView
            familles={familles}
            onSaveFamille={handleSaveFamille}
            onDeleteFamille={handleDeleteFamille}
          />
        )}

        {activeTab === 'etats' && (
          <EtatsView
            prestations={prestations}
            paiements={paiements}
            societes={societes}
            personnes={personnes}
            familles={familles}
            selectedSocieteId={selectedSocieteId}
          />
        )}

        {activeTab === 'entete' && (
          IS_WAMP_BUILD && !state.assuranceStorageSupported ? <p>Configuration en lecture seule jusqu’à la mise à jour de l’API.</p> : <EnteteView value={enteteConfig} onConfigChange={setEnteteConfig} />
        )}
      </div>
    </div>
  );
}

