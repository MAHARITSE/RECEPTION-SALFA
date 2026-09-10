import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  Search, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  FileCheck2, 
  User, 
  Receipt, 
  Building2, 
  Calendar, 
  DollarSign, 
  Tag, 
  Check, 
  HelpCircle,
  Sparkles,
  ChevronDown,
  Layers,
  Users,
  AlertCircle
} from 'lucide-react';
import { 
  Paiement, 
  LignePaiement, 
  Prestation, 
  LignePrestation, 
  Societe, 
  Personne, 
  Famille 
} from '../../types';
import { formatMoney, formatDate, formatDateTime, generateId, getCurrentTimestamp } from '../../utils/formatters';
import { maskNom } from '../../utils/inputMasks';

interface SaisieReglementModalProps {
  isOpen: boolean;
  onClose: () => void;
  societes: Societe[];
  personnes: Personne[];
  prestations: Prestation[];
  familles: Famille[];
  selectedSocieteId?: string;
  onSavePaiement: (newPaiement: Paiement, updatedPrestations: Prestation[]) => void;
}

export interface StagedBordereauLine {
  id: string;
  // Link to existing prestation if matched
  prestationId?: string;
  lignePrestationId?: string;
  numeroFacture?: string;
  dateSoins: string;
  // Insured Person Info
  personneId?: string;
  nomAgent: string;
  matricule: string;
  sousSociete?: string;
  // Act Info
  codeActe: string;
  libelleActe: string;
  // Financial fields
  montantInitial: number; // Montant brut ou réclamé
  montantReclame: number; // Part demandée à l'assurance
  montantPaye: number; // Part effectivement réglée par l'assurance
  ticketModerateur: number; // Part restant à la charge du patient
  montantExclu: number; // Montant rejeté / non couvert
  motifExclusion: string; // Motif de rejet éventuel
  remarques?: string;
  // Source flag
  isManualDirect: boolean;
}

export const SaisieReglementModal: React.FC<SaisieReglementModalProps> = ({
  isOpen,
  onClose,
  societes,
  personnes,
  prestations,
  familles,
  selectedSocieteId = 'ALL',
  onSavePaiement,
}) => {
  // Bordereau Header State
  const [societeId, setSocieteId] = useState<string>('');
  const [numeroBordereau, setNumeroBordereau] = useState<string>(() => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(100 + Math.random() * 900);
    return `BORD-${today}-${rand}`;
  });
  const [datePaiement, setDatePaiement] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dateSaisie, setDateSaisie] = useState<string>(() => getCurrentTimestamp());
  const [modePaiement, setModePaiement] = useState<'Virement bancaire' | 'Chèque' | 'Espèces' | 'Mobile Money' | 'Autre'>('Virement bancaire');
  const [referencePaiement, setReferencePaiement] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterUnpaidOnly, setFilterUnpaidOnly] = useState<boolean>(true);

  // Table Lines State (Lines in this settlement slip)
  const [bordereauLines, setBordereauLines] = useState<StagedBordereauLine[]>([]);

  // Alert Modal for Search / Action without selecting a Societe
  const [showSocieteAlertModal, setShowSocieteAlertModal] = useState<boolean>(false);
  const alertTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const triggerSocieteAlert = () => {
    if (alertTimerRef.current) {
      clearTimeout(alertTimerRef.current);
    }
    setShowSocieteAlertModal(true);
    // Persiste au moins 2 secondes (2.6 secondes pour confort visuel)
    alertTimerRef.current = setTimeout(() => {
      setShowSocieteAlertModal(false);
    }, 2600);
  };

  useEffect(() => {
    return () => {
      if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    };
  }, []);

  const focusSocieteSelect = () => {
    setShowSocieteAlertModal(false);
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    setTimeout(() => {
      const el = document.getElementById('select-societe-bordereau') as HTMLSelectElement | null;
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  // Manual Direct Line entry drawer / form toggle
  const [showManualForm, setShowManualForm] = useState<boolean>(false);
  const [manualNom, setManualNom] = useState<string>('');
  const [manualMatricule, setManualMatricule] = useState<string>('');
  const [manualFacture, setManualFacture] = useState<string>('');
  const [manualDateSoins, setManualDateSoins] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [manualCodeActe, setManualCodeActe] = useState<string>('CONS');
  const [manualLibelleActe, setManualLibelleActe] = useState<string>('Consultation Médicale');
  const [manualMontantReclame, setManualMontantReclame] = useState<number>(20000);
  const [manualMontantPaye, setManualMontantPaye] = useState<number>(20000);
  const [manualTicketMod, setManualTicketMod] = useState<number>(0);
  const [manualMontantExclu, setManualMontantExclu] = useState<number>(0);
  const [manualMotifExclu, setManualMotifExclu] = useState<string>('');

  // Thousand separator helpers for inputs
  const formatInputVal = (n: number) => (n === 0 ? '' : n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '));
  const parseInputVal = (s: string) => {
    const raw = s.replace(/\s/g, '');
    return raw === '' ? 0 : Number(raw) || 0;
  };

  // Reset or initialize on open - Activer Société / Assureur * -- Sélectionner une société --
  useEffect(() => {
    if (isOpen) {
      setSocieteId('');
      setSearchQuery('');
      // Réinitialise le formulaire de saisie libre (nom par défaut vide)
      setShowManualForm(false);
      setManualNom('');
      setManualMatricule('');
      setManualFacture('');
      // Nouvelle référence technique à chaque ouverture du formulaire.
      setDateSaisie(getCurrentTimestamp());
      if (bordereauLines.length === 0) {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const rand = Math.floor(100 + Math.random() * 900);
        setNumeroBordereau(`BORD-${today}-${rand}`);
      }
      const timer = setTimeout(() => {
        const selectEl = document.getElementById('select-societe-bordereau') as HTMLSelectElement | null;
        if (selectEl) {
          selectEl.focus();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Flattened searchable list of all existing acts across prestations
  const searchableActs = useMemo(() => {
    const list: Array<{
      id: string;
      prestationId: string;
      lignePrestationId: string;
      numeroFacture: string;
      dateSoins: string;
      societeId: string;
      societeNom: string;
      sousSociete: string;
      personneId?: string;
      nomAgent: string;
      matricule: string;
      codeActe: string;
      libelleActe: string;
      montantBrut: number;
      ticketModerateur: number;
      montantARembourser: number;
      totalPaye: number;
      montantExclu: number;
      resteAPayer: number;
      statut: string;
    }> = [];

    (prestations || []).forEach(p => {
      const pDate = p.date ? p.date.split('T')[0] : '';
      const sNom = societes.find(s => s.id === p.societeId)?.nom || p.societeNom || 'Société';
      const agentNom = p.nomAgent || 'Assuré inconnu';
      const mat = p.matricule || '-';

      if (p.lignes && p.lignes.length > 0) {
        p.lignes.forEach(l => {
          const lTot = l.totalPrestation || l.montant || 0;
          const lMod = l.ticketModerateur || 0;
          const lRemb = l.montantARembourser ?? Math.max(0, lTot - lMod);
          const lPaye = l.totalPaye || 0;
          const lExclu낙 = l.montantExclu || 0;
          const lReste = Math.max(0, lRemb - lPaye - lExclu낙);

          list.push({
            id: `${p.id}_${l.id}`,
            prestationId: p.id,
            lignePrestationId: l.id,
            numeroFacture: p.numeroFacture,
            dateSoins: pDate,
            societeId: p.societeId,
            societeNom: sNom,
            sousSociete: p.sousSociete || '',
            personneId: p.personneId,
            nomAgent: agentNom,
            matricule: mat,
            codeActe: l.code || 'ACTE',
            libelleActe: l.libelle || l.code || 'Prestation médicale',
            montantBrut: lTot,
            ticketModerateur: lMod,
            montantARembourser: lRemb,
            totalPaye: lPaye,
            montantExclu: lExclu낙,
            resteAPayer: lReste,
            statut: l.statut || p.statut || 'En attente',
          });
        });
      } else {
        const pTot便 = p.montantTotal ?? p.totalPrestation ?? 0;
        const pMod = p.ticketModerateur ?? p.participation ?? 0;
        const pRemb = p.montantARembourser ?? Math.max(0, pTot便 - pMod);
        const pPaye = p.totalPaye || 0;
        const pExclu = p.montantExclu || 0;
        const pReste = Math.max(0, pRemb - pPaye - pExclu);

        list.push({
          id: `${p.id}_global`,
          prestationId: p.id,
          lignePrestationId: p.id,
          numeroFacture: p.numeroFacture,
          dateSoins: pDate,
          societeId: p.societeId,
          societeNom: sNom,
          sousSociete: p.sousSociete || '',
          personneId: p.personneId,
          nomAgent: agentNom,
          matricule: mat,
          codeActe: 'GLOBAL',
          libelleActe: 'Facture globale',
          montantBrut: pTot便,
          ticketModerateur: pMod,
          montantARembourser: pRemb,
          totalPaye: pPaye,
          montantExclu: pExclu,
          resteAPayer: pReste,
          statut: p.statut || 'En attente',
        });
      }
    });

    return list;
  }, [prestations, societes]);

  // Filtered search results based on user query
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return searchableActs.filter(act => {
      // Filter by selected society if chosen
      if (societeId && act.societeId !== societeId) {
        return false;
      }

      // Filter unpaid only if enabled
      if (filterUnpaidOnly && act.resteAPayer <= 0 && act.statut === 'Payé') {
        return false;
      }

      // If already added to staged bordereau, ignore or allow? We allow but show badge
      if (!q) {
        // When no search query, show the most recent unpaid acts for this society
        return true;
      }

      const matchNom = act.nomAgent.toLowerCase().includes(q);
      const matchMatricule = act.matricule.toLowerCase().includes(q);
      const matchFacture深入 = act.numeroFacture.toLowerCase().includes(q);
      const matchCodeActe = act.codeActe.toLowerCase().includes(q) || act.libelleActe.toLowerCase().includes(q);
      const matchDate = act.dateSoins.includes(q);

      return matchNom || matchMatricule || matchFacture深入 || matchCodeActe || matchDate;
    });
  }, [searchableActs, searchQuery, filterUnpaidOnly, societeId]);

  // Check if an act is already added to the bordereau lines (now allowed to be repeated multiple times)
  const isActStaged = (prestationId: string, lignePrestationId: string) => {
    return false; // Permettre la répétition multiple du même acte dans le règlement
  };

  // Add an act from search results into the bordereau table (allowing multiple repetitions with memory amount reduction)
  const handleAddActToBordereau = (act: typeof searchableActs[0]) => {
    if (!societeId) {
      triggerSocieteAlert();
      return;
    }
    // Calculate how much has already been allocated (paye + tm + exclu) for this act in current bordereau lines
    const alreadyAllocated = bordereauLines
      .filter(l => l.prestationId === act.prestationId && l.lignePrestationId === act.lignePrestationId)
      .reduce((sum, l) => sum + (Number(l.montantPaye) || 0) + (Number(l.ticketModerateur) || 0) + (Number(l.montantExclu) || 0), 0);

    const totalFacture = act.montantBrut || act.montantARembourser;
    const defaultRemaining = Math.max(0, totalFacture - alreadyAllocated);
    const defaultPaye = defaultRemaining;
    const calculatedTM = 0;
    const calculatedExclu = 0;

    const newId = generateId('line_bord');
    const newLine: StagedBordereauLine = {
      id: newId,
      prestationId: act.prestationId,
      lignePrestationId: act.lignePrestationId,
      numeroFacture: act.numeroFacture,
      dateSoins: act.dateSoins,
      personneId: act.personneId,
      nomAgent: act.nomAgent,
      matricule: act.matricule,
      sousSociete: act.sousSociete,
      codeActe: act.codeActe,
      libelleActe: act.libelleActe,
      montantInitial: defaultRemaining, // Reste de la part demandée
      montantReclame: defaultRemaining, // Reste de la part demandée
      montantPaye: defaultPaye,
      ticketModerateur: calculatedTM,
      montantExclu: calculatedExclu,
      motifExclusion: '',
      isManualDirect: false,
    };

    setBordereauLines(prev => [...prev, newLine]);
    // Ferme directement le combo de recherche pour passer à l'écriture de l'acte
    setSearchQuery('');

    // Focus automatique sur le champ montant réglé
    setTimeout(() => {
      const inputEl = document.getElementById(`input-paye-${newId}`) as HTMLInputElement | null;
      inputEl?.focus();
      inputEl?.select();
    }, 60);
  };

  // Add all visible search results
  const handleAddAllSearchResults = () => {
    if (!societeId) {
      triggerSocieteAlert();
      return;
    }
    const toAdd = searchResults.filter(act => !isActStaged(act.prestationId, act.lignePrestationId));
    if (toAdd.length === 0) {
      return;
    }

    const newLines: StagedBordereauLine[] = toAdd.map(act => {
      const alreadyAllocated = bordereauLines
        .filter(l => l.prestationId === act.prestationId && l.lignePrestationId === act.lignePrestationId)
        .reduce((sum, l) => sum + (Number(l.montantPaye) || 0) + (Number(l.ticketModerateur) || 0) + (Number(l.montantExclu) || 0), 0);
      const totalFacture = act.montantBrut || act.montantARembourser;
      const defaultRemaining = Math.max(0, totalFacture - alreadyAllocated);
      const defaultPaye = defaultRemaining;
      const calculatedTM = 0;
      const calculatedExclu = 0;

      return {
        id: generateId('line_bord'),
        prestationId: act.prestationId,
        lignePrestationId: act.lignePrestationId,
        numeroFacture: act.numeroFacture,
        dateSoins: act.dateSoins,
        personneId: act.personneId,
        nomAgent: act.nomAgent,
        matricule: act.matricule,
        sousSociete: act.sousSociete,
        codeActe: act.codeActe,
        libelleActe: act.libelleActe,
        montantInitial: defaultRemaining,
        montantReclame: defaultRemaining,
        montantPaye: defaultPaye,
        ticketModerateur: calculatedTM,
        montantExclu: calculatedExclu,
        motifExclusion: '',
        isManualDirect: false,
      };
    });

    setBordereauLines(prev => [...prev, ...newLines]);
    setSearchQuery('');
  };

  // Add a manual line (for an unlisted person or act)
  const handleAddManualLine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!societeId) {
      triggerSocieteAlert();
      return;
    }
    if (!manualNom.trim()) {
      return;
    }

    const totalFacture = manualMontantReclame;
    const newId = generateId('line_man');
    const newLine: StagedBordereauLine = {
      id: newId,
      numeroFacture: manualFacture.trim() || undefined,
      dateSoins: manualDateSoins,
      nomAgent: maskNom(manualNom.trim()),
      matricule: manualMatricule.trim() || '-',
      codeActe: manualCodeActe.toUpperCase().trim(),
      libelleActe: manualLibelleActe.trim() || manualCodeActe,
      montantInitial: totalFacture,
      montantReclame: totalFacture,
      montantPaye: manualMontantPaye,
      ticketModerateur: manualTicketMod,
      montantExclu: manualMontantExclu,
      motifExclusion: manualMotifExclu.trim(),
      isManualDirect: true,
    };

    setBordereauLines(prev => [...prev, newLine]);
    // Reset manual form fields
    setManualNom('');
    setManualMatricule('');
    setManualFacture('');
    setManualMontantExclu(0);
    setManualMotifExclu('');
    setShowManualForm(false);

    setTimeout(() => {
      const inputEl = document.getElementById(`input-paye-${newId}`) as HTMLInputElement | null;
      inputEl?.focus();
      inputEl?.select();
    }, 60);
  };

  // Update a single cell in the staged table (no automatic calculation rule)
  const handleUpdateLine = (id: string, field: keyof StagedBordereauLine, value: any) => {
    setBordereauLines(prev => prev.map(line => {
      if (line.id !== id) return line;
      return { ...line, [field]: value };
    }));
  };

  // Remove a line from the bordereau table
  const handleRemoveLine = (id: string) => {
    setBordereauLines(prev => prev.filter(l => l.id !== id));
  };

  // Totals calculations
  const totalReclame = useMemo(() => bordereauLines.reduce((sum, l) => sum + (Number(l.montantInitial) || Number(l.montantReclame) || 0), 0), [bordereauLines]);
  const totalPaye = useMemo(() => bordereauLines.reduce((sum, l) => sum + (Number(l.montantPaye) || 0), 0), [bordereauLines]);
  const totalModerateur = useMemo(() => bordereauLines.reduce((sum, l) => sum + (Number(l.ticketModerateur) || 0), 0), [bordereauLines]);
  const totalExclu = useMemo(() => bordereauLines.reduce((sum, l) => sum + (Number(l.montantExclu) || 0), 0), [bordereauLines]);

  // Unique distinct persons in this bordereau
  const distinctPersonsCount进 = useMemo(() => {
    const names = new Set(bordereauLines.map(l => (l.nomAgent || '').trim().toLowerCase()).filter(Boolean));
    return names.size;
  }, [bordereauLines]);

  // Submit and Save the entire Bordereau
  const handleSubmitBordereau = (e: React.FormEvent) => {
    e.preventDefault();

    if (!societeId) {
      alert('Veuillez sélectionner une société / un garant avant de valider le bordereau.');
      return;
    }

    if (bordereauLines.length === 0) {
      alert('Veuillez ajouter au moins une ligne / acte dans le tableau du bordereau.');
      return;
    }

    if (!numeroBordereau.trim()) {
      alert('Veuillez indiquer un numéro ou référence de bordereau.');
      return;
    }

    const currentSociete = societes.find(s => s.id === societeId);
    const dateEnregistrement = getCurrentTimestamp();
    setDateSaisie(dateEnregistrement);

    // Create the Paiement object
    const paiementId = generateId('pmt');
    const paymentLines: LignePaiement[] = bordereauLines.map(line => ({
      id: generateId('lp'),
      paiementId,
      lignePrestationId: line.lignePrestationId || line.id,
      prestationId: line.prestationId || '',
      immatriculation: line.matricule || '-',
      nomBaseAssurance: line.nomAgent,
      nomAgent: line.nomAgent,
      prestationNumero: line.numeroFacture || '-',
      dateSoins: line.dateSoins,
      totalPaye: Number(line.montantPaye) || 0,
      montantPaye: Number(line.montantPaye) || 0,
      ticketModerateur: Number(line.ticketModerateur) || 0,
      montantExclu: Number(line.montantExclu) || 0,
      montantReclame: Number(line.montantReclame) || 0,
      codeActe: line.codeActe,
      libelleActe: line.libelleActe,
      commentaire: line.motifExclusion || line.remarques || undefined,
      actesPayes: [{
        code: line.codeActe,
        libelle: line.libelleActe,
        montant: Number(line.montantPaye) || 0
      }]
    }));

    const newPaiement: Paiement = {
      id: paiementId,
      numeroBordereau: numeroBordereau.trim(),
      datePaiement,
      dateSaisie: dateEnregistrement,
      societeId,
      societeNom: currentSociete?.nom || 'Société',
      modePaiement,
      referencePaiement: referencePaiement.trim() || numeroBordereau.trim(),
      totalReclame,
      totalPaye,
      totalModerateur,
      totalExclu,
      remise: 0,
      statut: 'Validé',
      lignes: paymentLines,
      notes: notes.trim() || undefined,
    };

    // Update related Prestations
    const affectedPrestationIds = new Set(bordereauLines.map(l => l.prestationId).filter(Boolean) as string[]);
    const updatedPrestations: Prestation[] = [];

    affectedPrestationIds.forEach(pId => {
      const originalPrestation = prestations.find(p => p.id === pId);
      if (!originalPrestation) return;

      const linesForThisPrestation = bordereauLines.filter(l => l.prestationId === pId);

      // Create a map of updates per line
      const lineUpdatesMap = new Map<string, StagedBordereauLine>();
      linesForThisPrestation.forEach(l => {
        if (l.lignePrestationId) {
          lineUpdatesMap.set(l.lignePrestationId, l);
        }
      });

      let updatedLignesTotalPaye = 0;
      let updatedLignesTotalExclu = 0;

      const updatedLignes: LignePrestation[] = (originalPrestation.lignes || []).map(ol => {
        const match = lineUpdatesMap.get(ol.id);
        const addedPaye = match ? Number(match.montantPaye) || 0 : 0;
        const addedExclu = match ? Number(match.montantExclu) || 0 : 0;
        const motif = match?.motifExclusion || ol.motifExclusion;

        const currentTotalPaye = (ol.totalPaye || 0) + addedPaye;
        const currentTotalExclu = (ol.montantExclu || 0) + addedExclu;

        const lTot = ol.totalPrestation || ol.montant || 0;
        const lMod = ol.ticketModerateur || 0;
        const lRemb = ol.montantARembourser ?? Math.max(0, lTot - lMod);
        const lReste = Math.max(0, lRemb - currentTotalPaye - currentTotalExclu);

        const isPaid = (currentTotalPaye >= lRemb && lRemb > 0) || (lReste <= 0 && currentTotalPaye > 0);
        const isPart = currentTotalPaye > 0 && !isPaid && lReste > 0;
        const isExcluded = currentTotalExclu >= lRemb && lRemb > 0 && currentTotalPaye === 0;

        updatedLignesTotalPaye += currentTotalPaye;
        updatedLignesTotalExclu += currentTotalExclu;

        return {
          ...ol,
          totalPaye: currentTotalPaye,
          montantExclu: currentTotalExclu,
          motifExclusion: motif,
          statut: isExcluded ? 'Rejeté' : isPaid ? 'Payé' : isPart ? 'Partiellement payé' : ol.statut || 'En attente',
        };
      });

      const pTot = originalPrestation.montantTotal ?? originalPrestation.totalPrestation ?? 0;
      const pMod = originalPrestation.ticketModerateur ?? originalPrestation.participation ?? 0;
      const pRemb = originalPrestation.montantARembourser ?? Math.max(0, pTot - pMod);

      const newTotalPaye = updatedLignes.length > 0
        ? updatedLignesTotalPaye
        : (originalPrestation.totalPaye || 0) + (linesForThisPrestation[0]?.montantPaye || 0);

      const newTotalExclu = updatedLignes.length > 0
        ? updatedLignesTotalExclu
        : (originalPrestation.montantExclu || 0) + (linesForThisPrestation[0]?.montantExclu || 0);

      const newResteAPayer不易 = Math.max(0, pRemb - newTotalPaye - newTotalExclu);

      const isFullyPaid = (newTotalPaye >= pRemb && pRemb > 0) || (newResteAPayer不易 <= 0 && newTotalPaye > 0);
      const isPartiallyPaid = newTotalPaye > 0 && !isFullyPaid && newResteAPayer不易 > 0;
      const isAllExcluded = newTotalExclu >= pRemb && pRemb > 0 && newTotalPaye === 0;

      const updatedP: Prestation = {
        ...originalPrestation,
        totalPaye: newTotalPaye,
        montantExclu: newTotalExclu,
        resteAPayer: newResteAPayer不易,
        datePaiement,
        numeroBordereau: numeroBordereau.trim(),
        statut: isAllExcluded ? 'Rejeté' : isFullyPaid ? 'Payé' : isPartiallyPaid ? 'Partiellement payé' : originalPrestation.statut,
        lignes: updatedLignes.length > 0 ? updatedLignes : originalPrestation.lignes,
      };

      updatedPrestations.push(updatedP);
    });

    // Call parent handler to save payment and update prestations
    onSavePaiement(newPaiement, updatedPrestations);

    // Reset and close
    setBordereauLines([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-in fade-in duration-150">
      <div className="bg-surface rounded-2xl max-w-6xl w-full max-h-[94vh] shadow-2xl flex flex-col overflow-hidden border border-line">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>Saisie Manuelle d'un Bordereau de Règlement</span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Multi-Assurés / Multi-Actes
                </span>
              </h2>
              <p className="text-xs text-ink-faint">
                Saisissez les règlements reçus de l'assurance en recherchant et lettrant les actes par assuré ou matricule.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-ink-faint hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 bg-surface-muted/50">

          {/* Section 1: En-tête du Bordereau de Règlement */}
          <div className="bg-surface p-4 rounded-xl border border-line shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-ink font-bold text-xs uppercase tracking-wider border-b border-line-soft pb-2">
              <Receipt className="w-4 h-4 text-emerald-600" />
              <span>1. Informations Générales du Bordereau</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
              {/* Société Assureur */}
              <div>
                <label className="block text-ink font-semibold mb-1">
                  Société / Assureur *
                </label>
                <select
                  id="select-societe-bordereau"
                  autoFocus
                  value={societeId}
                  onChange={(e) => setSocieteId(e.target.value)}
                  className="w-full p-2 bg-surface-muted border border-line-strong rounded-lg font-bold text-ink-strong focus:bg-surface focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">-- Sélectionner une société --</option>
                  {societes.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.nom} ({s.code}) - {s.tauxCouvertureDefaut}%
                    </option>
                  ))}
                </select>
              </div>

              {/* N° Bordereau */}
              <div>
                <label className="block text-ink font-semibold mb-1">
                  N° Bordereau Règlement *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: BORD-2026-001"
                  value={numeroBordereau}
                  onChange={(e) => setNumeroBordereau(e.target.value)}
                  className="w-full p-2 border border-line-strong rounded-lg font-mono font-bold text-emerald-700 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Date Règlement */}
              <div>
                <label className="block text-ink font-semibold mb-1">
                  Date du Règlement *
                </label>
                <input
                  type="date"
                  required
                  value={datePaiement}
                  onChange={(e) => setDatePaiement(e.target.value)}
                  className="w-full p-2 border border-line-strong rounded-lg font-medium text-ink focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Date automatique de saisie */}
              <div>
                <label className="block text-ink font-semibold mb-1">
                  Date import / saisie
                </label>
                <div
                  className="w-full p-2 border border-indigo-200 rounded-lg font-medium text-indigo-800 bg-indigo-50 whitespace-nowrap"
                  title="Horodatage automatique et immuable de l'enregistrement"
                >
                  {formatDateTime(dateSaisie)}
                </div>
              </div>

              {/* Mode de Paiement */}
              <div>
                <label className="block text-ink font-semibold mb-1">
                  Mode de Règlement
                </label>
                <select
                  value={modePaiement}
                  onChange={(e) => setModePaiement(e.target.value as any)}
                  className="w-full p-2 border border-line-strong rounded-lg text-ink focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="Virement bancaire">Virement bancaire</option>
                  <option value="Chèque">Chèque</option>
                  <option value="Espèces">Espèces</option>
                  <option value="Mobile Money">Mobile Money</option>
                  <option value="Autre">Autre</option>
                </select>
              </div>

              {/* Référence Transaction / Chèque */}
              <div>
                <label className="block text-ink font-semibold mb-1">
                  Réf. Transaction / N° Chèque
                </label>
                <input
                  type="text"
                  placeholder="Ex: VIR-BNI-987654"
                  value={referencePaiement}
                  onChange={(e) => setReferencePaiement(e.target.value)}
                  className="w-full p-2 border border-line-strong rounded-lg text-ink focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Notes & Observations */}
            <div className="pt-1">
              <label className="block text-ink font-semibold text-xs mb-1">
                Observations / Motif du bordereau
              </label>
              <input
                type="text"
                placeholder="Ex: Règlement décompte quinzaine santé, virement groupé..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-2 text-xs border border-line-strong rounded-lg text-ink focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Section 2: Recherche des Actes et Personnes */}
          <div className="bg-surface p-4 rounded-xl border border-line shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-2">
              <div className="flex items-center gap-2 text-ink font-bold text-xs uppercase tracking-wider">
                <Search className="w-4 h-4 text-indigo-600" />
                <span>2. Trouver les Actes Médicaux à Régler</span>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    if (!showManualForm) {
                      if (!societeId) {
                        triggerSocieteAlert();
                      }
                      // Le nom recherché devient le nom par défaut de la saisie libre
                      const searchedName = searchQuery.trim();
                      if (searchedName) {
                        setManualNom(maskNom(searchedName));
                      }
                      setShowManualForm(true);
                    } else {
                      setShowManualForm(false);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 font-semibold transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showManualForm ? 'Masquer la saisie libre' : '+ Saisie libre d’un acte non listé'}</span>
                </button>
              </div>
            </div>

            {/* Search Input Bar with Interactive Floating Dropdown for Results */}
            <div className="space-y-2 relative">
              <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
                {/* Search input with built-in clear button and dynamic live dropdown */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink-faint" />
                  <input
                    type="text"
                    placeholder="Tapez pour rechercher (Nom de l'adhérent, N° Immatriculation, Facture, Acte)..."
                    value={searchQuery}
                    onFocus={() => {
                      if (!societeId) {
                        triggerSocieteAlert();
                      }
                    }}
                    onChange={(e) => {
                      const val = maskNom(e.target.value);
                      if (val.trim() !== '' && !societeId) {
                        triggerSocieteAlert();
                      }
                      setSearchQuery(val);
                    }}
                    className="w-full pl-9 pr-24 py-2.5 text-xs rounded-xl border border-line-strong bg-surface focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none font-medium shadow-2xs"
                  />

                  <div className="absolute right-2 top-2 flex items-center gap-1.5">
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="p-1 text-ink-faint hover:text-ink-secondary rounded-md hover:bg-surface-hover cursor-pointer"
                        title="Effacer la recherche"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                      {searchResults.length} résultat{searchResults.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Filter Toggles */}
                <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
                  <button
                    type="button"
                    onClick={() => setFilterUnpaidOnly(!filterUnpaidOnly)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium border text-[11px] transition cursor-pointer ${
                      filterUnpaidOnly
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
                        : 'bg-surface text-ink-secondary border-line hover:bg-surface-muted'
                    }`}
                  >
                    <span>En attente de paiement</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${filterUnpaidOnly ? 'bg-emerald-600' : 'bg-slate-300'}`}></span>
                  </button>
                </div>
              </div>

              {/* DROPDOWN / ZONE DEROULANTE DES RESULTATS */}
              {searchQuery.trim() !== '' && (
                <div className="border border-line rounded-xl overflow-hidden bg-surface shadow-lg animate-in fade-in slide-in-from-top-1 duration-150 z-20">
                  <div className="bg-surface-hover/90 px-3 py-2 border-b border-line flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink uppercase tracking-wider text-[10px]">
                        Résultats pour « {searchQuery} » ({searchResults.length})
                      </span>
                    </div>
                    {searchResults.length > 1 && (
                      <button
                        type="button"
                        onClick={handleAddAllSearchResults}
                        className="text-indigo-600 hover:text-indigo-800 font-bold hover:underline cursor-pointer text-[11px] flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Tout ajouter au bordereau ({searchResults.filter(a => !isActStaged(a.prestationId, a.lignePrestationId)).length})</span>
                      </button>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                    {searchResults.length === 0 ? (
                      <div className="p-5 text-center text-ink-faint space-y-2">
                        <AlertCircle className="w-5 h-5 text-slate-300 mx-auto" />
                        <div className="text-xs text-ink-secondary font-medium">
                          Aucun acte ne correspond à « {searchQuery} »
                        </div>
                        <div className="text-[11px] text-ink-muted">
                          Ce nom est introuvable dans les actes existants. Saisissez-le librement pour l'ajouter directement au bordereau.
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (!societeId) {
                              triggerSocieteAlert();
                            }
                            setShowManualForm(true);
                            setManualNom(maskNom(searchQuery.trim()));
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs transition cursor-pointer mx-auto"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ Saisir « {searchQuery} » en saisie libre</span>
                        </button>
                      </div>
                    ) : (
                      searchResults.map((act) => {
                        const alreadyStaged = isActStaged(act.prestationId, act.lignePrestationId);

                        return (
                          <div
                            key={act.id}
                            onClick={() => handleAddActToBordereau(act)}
                            className={`p-2.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs cursor-pointer ${
                              alreadyStaged ? 'bg-emerald-50/50 hover:bg-emerald-100/60' : 'hover:bg-indigo-50/70'
                            }`}
                          >
                            {/* Adherent / Matricule / Facture */}
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="font-extrabold text-ink-strong text-xs hover:text-indigo-600 transition">
                                  {act.nomAgent}
                                </span>
                                {act.matricule && act.matricule !== '-' && (
                                  <span className="font-mono text-[10px] bg-surface-hover text-ink px-1.5 py-0.2 rounded font-bold border border-line">
                                    Mat : {act.matricule}
                                  </span>
                                )}
                                {act.sousSociete && (
                                  <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded font-medium border border-indigo-100">
                                    {act.sousSociete}
                                  </span>
                                )}
                                <span className="text-[10px] text-ink-muted font-mono">
                                  Facture: <strong>{act.numeroFacture}</strong> ({formatDate(act.dateSoins)})
                                </span>
                              </div>

                              <div className="flex items-center flex-wrap gap-2 text-[11px] text-ink-secondary">
                                <span className="font-mono font-bold text-ink bg-surface-hover px-1.5 py-0.2 rounded text-[10px]">
                                  {act.codeActe}
                                </span>
                                <span className="truncate max-w-xs">{act.libelleActe}</span>
                                <span className="text-ink-faint">•</span>
                                <span>Part Demandée (Facture): <strong className="text-ink font-mono">{formatMoney(act.montantBrut)}</strong></span>
                                {act.ticketModerateur > 0 && (
                                  <span className="text-amber-700 font-medium font-mono">TM: {formatMoney(act.ticketModerateur)}</span>
                                )}
                              </div>
                            </div>

                            {/* Reste à Payer & Action Button */}
                            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                              <div className="text-right">
                                <span className="text-[10px] text-ink-faint uppercase tracking-wider block font-semibold">Reste dû</span>
                                <span className="font-extrabold text-emerald-700 font-mono text-xs">
                                  {formatMoney(act.resteAPayer)}
                                </span>
                              </div>

                              {alreadyStaged ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Sélectionné</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddActToBordereau(act);
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-2xs transition cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Ajouter & Saisir</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Manual Add Form */}
            {showManualForm && (
              <form onSubmit={handleAddManualLine} className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200 space-y-3 animate-in fade-in duration-150">
                <div className="font-bold text-xs text-indigo-950 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span>Saisie Manuelle d'une Ligne d'Acte (Patient / Acte spécifique)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                  <div>
                    <label className="block text-ink font-semibold mb-1">Nom Assuré / Patient *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: RABE Jean"
                      value={manualNom}
                      onChange={(e) => setManualNom(maskNom(e.target.value))}
                      className="w-full p-1.5 border border-line-strong rounded-lg bg-surface uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-ink font-semibold mb-1">N° Immatriculation / Matricule</label>
                    <input
                      type="text"
                      placeholder="Ex: MAT-0123"
                      value={manualMatricule}
                      onChange={(e) => setManualMatricule(e.target.value)}
                      className="w-full p-1.5 border border-line-strong rounded-lg bg-surface font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-ink font-semibold mb-1">Date des Soins</label>
                    <input
                      type="date"
                      value={manualDateSoins}
                      onChange={(e) => setManualDateSoins(e.target.value)}
                      className="w-full p-1.5 border border-line-strong rounded-lg bg-surface"
                    />
                  </div>

                  <div>
                    <label className="block text-ink font-semibold mb-1">N° Facture (optionnel)</label>
                    <input
                      type="text"
                      placeholder="Ex: FAC-2026-009"
                      value={manualFacture}
                      onChange={(e) => setManualFacture(e.target.value)}
                      className="w-full p-1.5 border border-line-strong rounded-lg bg-surface font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-ink font-semibold mb-1">Code & Type d'Acte</label>
                    <select
                      value={manualCodeActe}
                      onChange={(e) => {
                        const code = e.target.value;
                        setManualCodeActe(code);
                        const f = familles.find(fam => fam.code === code);
                        if (f) setManualLibelleActe(f.libelle);
                      }}
                      className="w-full p-1.5 border border-line-strong rounded-lg bg-surface font-semibold"
                    >
                      {familles.map(f => (
                        <option key={f.id} value={f.code}>{f.code} - {f.libelle}</option>
                      ))}
                      <option value="CONS">CONS - Consultation</option>
                      <option value="MEDIC">MEDIC - Pharmacie</option>
                      <option value="LABO">LABO - Biologie</option>
                      <option value="DENT">DENT - Soins dentaires</option>
                      <option value="HOSP">HOSP - Hospitalisation</option>
                      <option value="ECHO">ECHO - Échographie</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-ink font-semibold mb-1">Part Demandée / Total (Ar) *</label>
                    <input
                      type="text"
                      value={formatInputVal(manualMontantReclame)}
                      onChange={(e) => setManualMontantReclame(parseInputVal(e.target.value))}
                      className="w-full p-1.5 border border-line-strong rounded-lg bg-surface text-right font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-emerald-800 font-bold mb-1">Montant Réglé / Payé (Ar) *</label>
                    <input
                      type="text"
                      value={formatInputVal(manualMontantPaye)}
                      onChange={(e) => setManualMontantPaye(parseInputVal(e.target.value))}
                      className="w-full p-1.5 border border-emerald-400 rounded-lg bg-surface text-right font-bold text-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="block text-amber-800 font-semibold mb-1">Ticket Modérateur (Ar)</label>
                    <input
                      type="text"
                      value={formatInputVal(manualTicketMod)}
                      onChange={(e) => setManualTicketMod(parseInputVal(e.target.value))}
                      className="w-full p-1.5 border border-amber-300 rounded-lg bg-surface text-right font-semibold text-amber-700"
                    />
                  </div>

                  <div>
                    <label className="block text-rose-700 font-semibold mb-1">Montant Exclu / Rejet (Ar)</label>
                    <input
                      type="text"
                      value={formatInputVal(manualMontantExclu)}
                      onChange={(e) => setManualMontantExclu(parseInputVal(e.target.value))}
                      className="w-full p-1.5 border border-rose-300 rounded-lg bg-surface text-right font-semibold text-rose-600"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowManualForm(false)}
                    className="px-3 py-1.5 rounded-lg border border-line-strong text-ink-secondary hover:bg-surface-hover text-xs font-semibold cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Ajouter cette ligne au bordereau</span>
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Section 3: Tableau du Bordereau (Rempli une à une - Multi-personnes) */}
          <div className="bg-surface p-4 rounded-xl border border-line shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-2">
              <div className="flex items-center gap-2 text-ink font-bold text-xs uppercase tracking-wider">
                <Layers className="w-4 h-4 text-emerald-600" />
                <span>3. Tableau des Actes Réglés dans ce Bordereau ({bordereauLines.length} ligne(s))</span>
              </div>

              {bordereauLines.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Voulez-vous vider toutes les lignes de ce bordereau ?')) {
                      setBordereauLines([]);
                    }
                  }}
                  className="text-rose-600 hover:text-rose-800 font-semibold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Tout effacer</span>
                </button>
              )}
            </div>

            {/* Staged lines table */}
            <div className="border border-line rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-hover text-ink uppercase text-[11px] font-semibold sticky top-0 z-10 border-b border-line shadow-2xs">
                  <tr>
                    <th className="p-2.5 w-8 text-center">#</th>
                    <th className="p-2.5">Adhérent / Patient</th>
                    <th className="p-2.5">Immatriculation</th>
                    <th className="p-2.5">Facture & Soins</th>
                    <th className="p-2.5">Acte Médical</th>
                    <th className="p-2.5 text-right w-28">Part Demandée (Ar)</th>
                    <th className="p-2.5 text-right w-32 bg-emerald-50/60 text-emerald-950 font-bold">Montant Réglé (Ar) *</th>
                    <th className="p-2.5 text-right w-28">Ticket Mod.</th>
                    <th className="p-2.5 text-right w-28">Exclu / Rejet</th>
                    <th className="p-2.5">Motif Rejet / Observation</th>
                    <th className="p-2.5 text-center w-10">Retirer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-surface">
                  {bordereauLines.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-ink-faint space-y-2">
                        <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
                        <div className="font-semibold text-ink-secondary">Le tableau du bordereau est vide.</div>
                        <p className="text-xs text-ink-faint max-w-md mx-auto">
                          Recherchez des actes ci-dessus par <strong>Nom</strong> ou <strong>Immatriculation</strong> et cliquez sur le nom ou <strong>« Ajouter »</strong> pour remplir ce bordereau.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    bordereauLines.map((line, idx) => (
                      <tr key={line.id} className="hover:bg-surface-muted transition">
                        <td className="p-2 text-center text-ink-faint font-mono text-[10px]">
                          {idx + 1}
                        </td>
                        <td className="p-2">
                          <div className="font-bold text-ink-strong">{line.nomAgent}</div>
                          {line.isManualDirect && (
                            <span className="inline-block px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[9px] font-bold border border-indigo-200">
                              Saisie directe
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-mono font-medium text-ink text-[11px]">
                          {line.matricule || '-'}
                        </td>
                        <td className="p-2">
                          {line.numeroFacture ? (
                            <span className="font-mono font-bold text-indigo-700">{line.numeroFacture}</span>
                          ) : (
                            <span className="text-ink-faint italic">Sans facture</span>
                          )}
                          <div className="text-[10px] text-ink-faint">{formatDate(line.dateSoins)}</div>
                        </td>
                        <td className="p-2">
                          <span className="px-1.5 py-0.5 rounded bg-surface-hover font-mono font-bold text-ink text-[10px] mr-1">
                            {line.codeActe}
                          </span>
                          <span className="text-ink">{line.libelleActe}</span>
                        </td>
                        <td className="p-2 text-right font-bold text-ink font-mono">
                          {formatMoney(line.montantInitial || line.montantReclame)}
                        </td>
                        <td className="p-2 text-right bg-emerald-50/30">
                          <input
                            id={`input-paye-${line.id}`}
                            type="text"
                            value={formatInputVal(line.montantPaye)}
                            onChange={(e) => handleUpdateLine(line.id, 'montantPaye', parseInputVal(e.target.value))}
                            className="w-full p-1 border border-emerald-400 rounded text-right font-bold text-emerald-700 bg-surface focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input
                            id={`input-tm-${line.id}`}
                            type="text"
                            value={formatInputVal(line.ticketModerateur)}
                            onChange={(e) => handleUpdateLine(line.id, 'ticketModerateur', parseInputVal(e.target.value))}
                            className="w-full p-1 border border-line-strong rounded text-right font-medium text-amber-700 bg-surface focus:ring-2 focus:ring-amber-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-2 text-right">
                          <input
                            id={`input-exclu-${line.id}`}
                            type="text"
                            value={formatInputVal(line.montantExclu)}
                            onChange={(e) => handleUpdateLine(line.id, 'montantExclu', parseInputVal(e.target.value))}
                            className={`w-full p-1 border rounded text-right font-semibold focus:ring-2 focus:ring-rose-500 focus:outline-none ${
                              line.montantExclu > 0
                                ? 'bg-rose-50 border-rose-400 text-rose-700 font-bold'
                                : 'border-line-strong text-ink-secondary bg-surface'
                            }`}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            placeholder="Motif si rejet ou note..."
                            value={line.motifExclusion || ''}
                            onChange={(e) => handleUpdateLine(line.id, 'motifExclusion', e.target.value)}
                            className="w-full p-1 text-[11px] border border-line-strong rounded bg-surface focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            title="Retirer cette ligne"
                            className="p-1 text-ink-faint hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Section 4: Barre de Totaux et Synthèse */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 bg-slate-900 text-white p-4 rounded-xl border border-slate-800 text-xs">
              <div>
                <span className="text-ink-faint block text-[10px] uppercase tracking-wider font-semibold">
                  Personnes / Assurés
                </span>
                <span className="text-sm font-bold text-indigo-300 flex items-center gap-1 mt-0.5">
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>{distinctPersonsCount进} personne(s)</span>
                </span>
              </div>

              <div>
                <span className="text-ink-faint block text-[10px] uppercase tracking-wider font-semibold">
                  Nombre d'Actes
                </span>
                <span className="text-sm font-bold text-slate-200 mt-0.5 block">
                  {bordereauLines.length} acte(s)
                </span>
              </div>

              <div>
                <span className="text-ink-faint block text-[10px] uppercase tracking-wider font-semibold">
                  Total Part Demandée
                </span>
                <span className="text-sm font-bold text-slate-200 mt-0.5 block font-mono">
                  {formatMoney(totalReclame)}
                </span>
              </div>

              <div className="bg-emerald-950/80 p-2 rounded-lg border border-emerald-700/50 -m-1 sm:col-span-1">
                <span className="text-emerald-400 block text-[10px] uppercase tracking-wider font-extrabold">
                  Total Règlement (Net Payé)
                </span>
                <span className="text-base font-extrabold text-emerald-300 mt-0.5 block">
                  {formatMoney(totalPaye)}
                </span>
              </div>

              <div>
                <span className="text-amber-400 block text-[10px] uppercase tracking-wider font-semibold">
                  Tickets Modérateurs
                </span>
                <span className="text-sm font-bold text-amber-300 mt-0.5 block">
                  {formatMoney(totalModerateur)}
                </span>
              </div>

              <div>
                <span className="text-rose-400 block text-[10px] uppercase tracking-wider font-semibold">
                  Total Rejets / Exclus
                </span>
                <span className="text-sm font-bold text-rose-300 mt-0.5 block">
                  {formatMoney(totalExclu)}
                </span>
              </div>
            </div>

          </div>

        </div>

        {/* Modal Action Buttons Footer */}
        <div className="px-6 py-4 bg-surface border-t border-line flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-ink-muted">
            {bordereauLines.length > 0 ? (
              <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Prêt à valider : {bordereauLines.length} acte(s) pour un total de {formatMoney(totalPaye)}</span>
              </span>
            ) : (
              <span>Veuillez ajouter des lignes pour pouvoir enregistrer le bordereau.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-line-strong text-ink hover:bg-surface-hover transition cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={bordereauLines.length === 0}
              onClick={handleSubmitBordereau}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Enregistrer et Valider le Bordereau de Règlement</span>
            </button>
          </div>
        </div>

      </div>

      {/* Centered Modal Alert: Choix Société Obligatoire (affiche au moins 2 secondes) */}
      {showSocieteAlertModal && (
        <div
          id="modal-alert-societe-requise"
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setShowSocieteAlertModal(false)}
        >
          <div
            className="bg-surface rounded-2xl max-w-md w-full p-6 shadow-2xl border-2 border-amber-400 relative overflow-hidden transform transition-all animate-in zoom-in-95 duration-200 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Auto-Dismiss Progress Indicator Bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-100 overflow-hidden">
              <div 
                className="h-full bg-amber-500 animate-[progress_2600ms_linear_forwards]"
                style={{
                  width: '100%',
                  animation: 'shrink 2.6s linear forwards'
                }}
              />
            </div>

            {/* Icon */}
            <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mb-4 ring-8 ring-amber-50 shadow-inner">
              <AlertTriangle className="w-9 h-9 stroke-[2.2] animate-bounce" />
            </div>

            {/* Title */}
            <h3 className="text-base font-extrabold text-ink-strong mb-2">
              Sélection d'une Société Requise
            </h3>

            {/* Description / Message */}
            <p className="text-xs text-ink-secondary leading-relaxed mb-6">
              Lors de la saisie d'un bordereau de règlement, vous devez obligatoirement sélectionner au préalable une <strong className="text-ink-strong font-bold">Société / Assureur</strong> dans l'en-tête avant de pouvoir rechercher ou ajouter des actes de soins.
            </p>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
              <button
                type="button"
                id="btn-alert-focus-societe"
                onClick={focusSocieteSelect}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md shadow-amber-600/20 transition cursor-pointer flex items-center justify-center gap-2 active:scale-95"
              >
                <Building2 className="w-4 h-4" />
                <span>Choisir la Société maintenant</span>
              </button>
              <button
                type="button"
                id="btn-alert-dismiss"
                onClick={() => setShowSocieteAlertModal(false)}
                className="px-4 py-2.5 rounded-xl bg-surface-hover hover:bg-surface-active text-ink font-bold text-xs transition cursor-pointer active:scale-95"
              >
                Compris
              </button>
            </div>

            {/* Countdown notice */}
            <p className="text-[11px] text-ink-faint mt-4 flex items-center justify-center gap-1.5">
              <span>Fermeture automatique dans 2 secondes...</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
