import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  Link2, 
  CheckCircle2, 
  AlertTriangle, 
  Receipt, 
  User, 
  Calendar, 
  Sparkles,
  Unlink,
  Check,
  FileCheck2
} from 'lucide-react';
import { Prestation, LignePrestation, Paiement, LignePaiement } from '../../types';
import { formatMoney, formatDate } from '../../utils/formatters';
import { maskNom } from '../../utils/inputMasks';

interface ChangerLiaisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  prestation: Prestation | null;
  lignePrestation: LignePrestation | null;
  paiements: Paiement[];
  onSavePaiement: (paiement: Paiement, updatedPrestations: Prestation[]) => void;
}

export const ChangerLiaisonModal: React.FC<ChangerLiaisonModalProps> = ({
  isOpen,
  onClose,
  prestation,
  lignePrestation,
  paiements,
  onSavePaiement,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUnlinkedOnly, setFilterUnlinkedOnly] = useState(false);
  const [selectedPaiementId, setSelectedPaiementId] = useState<string | null>(null);
  const [selectedLignePaiementId, setSelectedLignePaiementId] = useState<string | null>(null);

  // Find currently linked payment line(s)
  const currentLinkedLines = useMemo(() => {
    if (!prestation || !lignePrestation) return [];
    const found: Array<{ paiement: Paiement; ligne: LignePaiement }> = [];

    (paiements || []).forEach(p => {
      (p.lignes || []).forEach(l => {
        const isDirectIdMatch = l.prestationId === prestation.id && l.lignePrestationId === lignePrestation.id;
        const isFactureCodeMatch = l.prestationNumero === prestation.numeroFacture && l.codeActe === lignePrestation.code;

        if (isDirectIdMatch || isFactureCodeMatch) {
          found.push({ paiement: p, ligne: l });
        }
      });
    });

    return found;
  }, [prestation, lignePrestation, paiements]);

  // Set default selected when modal opens
  React.useEffect(() => {
    if (currentLinkedLines.length > 0) {
      setSelectedPaiementId(currentLinkedLines[0].paiement.id);
      setSelectedLignePaiementId(currentLinkedLines[0].ligne.id);
    } else {
      setSelectedPaiementId(null);
      setSelectedLignePaiementId(null);
    }
    setSearchTerm('');
  }, [currentLinkedLines, isOpen]);

  if (!isOpen || !prestation || !lignePrestation) return null;

  const currentPatientName = (prestation.nomAgent || '').trim().toLowerCase();
  const currentMatricule = (prestation.matricule || '').trim().toLowerCase();

  // Search all payment lines in database
  const allSettlementCandidates = useMemo(() => {
    const list: Array<{
      paiement: Paiement;
      ligne: LignePaiement;
      isPatientMatch: boolean;
      isCodeMatch: boolean;
      isAmountMatch: boolean;
      isCurrentlyLinked: boolean;
    }> = [];

    const lBrut = lignePrestation.totalPrestation || 0;
    const lPart = lignePrestation.ticketModerateur || 0;
    const lRemb = Math.max(0, lBrut - lPart);

    (paiements || []).forEach(p => {
      // STRICT INTER-SOCIETY RULE: Disallow linking payment to prestation of a different society/garant
      if (p.societeId && prestation.societeId && p.societeId !== prestation.societeId) {
        return;
      }

      (p.lignes || []).forEach(l => {
        const pAgent = (l.nomAgent || l.nomBaseAssurance || '').trim().toLowerCase();
        const pMat = (l.immatriculation || '').trim().toLowerCase();
        const pCode = (l.codeActe || '').trim().toLowerCase();
        const pPaye = l.totalPaye || l.montantPaye || 0;

        const isPatientMatch = 
          (currentMatricule && pMat && currentMatricule === pMat) ||
          (currentPatientName && pAgent && (currentPatientName.includes(pAgent) || pAgent.includes(currentPatientName)));

        const isCodeMatch = pCode === lignePrestation.code.toLowerCase();
        const isAmountMatch = Math.abs(pPaye - lRemb) < 100 || Math.abs(pPaye - lBrut) < 100;

        const isCurrentlyLinked = l.prestationId === prestation.id && (l.lignePrestationId === lignePrestation.id || l.codeActe === lignePrestation.code);
        const isUnlinked = !l.prestationId && !l.prestationNumero;

        const q = searchTerm.toLowerCase().trim();
        const matchSearch = !q ||
          p.numeroBordereau.toLowerCase().includes(q) ||
          p.referencePaiement.toLowerCase().includes(q) ||
          pAgent.includes(q) ||
          pMat.includes(q) ||
          pCode.includes(q);

        if (matchSearch) {
          if (!filterUnlinkedOnly || isUnlinked || isCurrentlyLinked) {
            list.push({
              paiement: p,
              ligne: l,
              isPatientMatch: Boolean(isPatientMatch),
              isCodeMatch,
              isAmountMatch,
              isCurrentlyLinked,
            });
          }
        }
      });
    });

    return list.sort((a, b) => {
      if (a.isCurrentlyLinked && !b.isCurrentlyLinked) return -1;
      if (!a.isCurrentlyLinked && b.isCurrentlyLinked) return 1;
      if (a.isPatientMatch && !b.isPatientMatch) return -1;
      if (!a.isPatientMatch && b.isPatientMatch) return 1;
      return b.paiement.datePaiement.localeCompare(a.paiement.datePaiement);
    });
  }, [paiements, prestation, lignePrestation, currentPatientName, currentMatricule, searchTerm, filterUnlinkedOnly]);

  const handleSelectLine = (paiementId: string, ligneId: string) => {
    setSelectedPaiementId(paiementId);
    setSelectedLignePaiementId(ligneId);
  };

  const handleConfirmLink = () => {
    if (!selectedPaiementId || !selectedLignePaiementId) {
      alert('Veuillez sélectionner un règlement / bordereau dans la liste.');
      return;
    }

    const targetPaiement = paiements.find(p => p.id === selectedPaiementId);
    if (!targetPaiement) return;

    // Update the chosen payment line
    const updatedLignes = targetPaiement.lignes.map(l => {
      if (l.id === selectedLignePaiementId) {
        return {
          ...l,
          prestationId: prestation.id,
          prestationNumero: prestation.numeroFacture,
          lignePrestationId: lignePrestation.id,
          codeActe: l.codeActe || lignePrestation.code,
          libelleActe: l.libelleActe || lignePrestation.libelle,
          nomAgent: prestation.nomAgent || l.nomAgent,
          immatriculation: prestation.matricule || l.immatriculation,
        };
      }
      return l;
    });

    const updatedPaiement: Paiement = {
      ...targetPaiement,
      lignes: updatedLignes,
    };

    onSavePaiement(updatedPaiement, [prestation]);
    onClose();
  };

  const handleUnlink = (p: Paiement, l: LignePaiement) => {
    const updatedLignes = p.lignes.map(item => {
      if (item.id === l.id) {
        return {
          ...item,
          prestationId: '',
          prestationNumero: '',
          lignePrestationId: '',
        };
      }
      return item;
    });

    const updatedPaiement: Paiement = {
      ...p,
      lignes: updatedLignes,
    };

    onSavePaiement(updatedPaiement, [prestation]);
  };

  const lBrut = lignePrestation.totalPrestation || 0;
  const lPart = lignePrestation.ticketModerateur || 0;
  const lRemb = Math.max(0, lBrut - lPart);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto font-sans antialiased">
      <div className="bg-surface rounded-2xl shadow-2xl border border-line w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-surface/10 backdrop-blur-md border border-white/20 text-indigo-200">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Modifier la Liaison de l'Acte Médical
              </h2>
              <p className="text-xs text-indigo-200 font-medium">
                Changer le règlement ou bordereau associé à cet acte de soin
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-indigo-200 hover:text-white hover:bg-surface/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Card - Current Act Details */}
        <div className="p-4 bg-surface-muted border-b border-line shrink-0">
          <div className="bg-surface rounded-xl p-3.5 border border-line shadow-2xs grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold text-ink-faint uppercase block">Facture Prescrite</span>
              <span className="font-mono font-bold text-indigo-700 text-sm">N° {prestation.numeroFacture}</span>
              <span className="text-[11px] text-ink-muted block">{formatDate(prestation.date)}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-ink-faint uppercase block">Assuré / Patient</span>
              <span className="font-bold text-ink-strong block truncate">{prestation.nomAgent || 'Assuré'}</span>
              <span className="font-mono text-[11px] text-ink-muted block">Mat: {prestation.matricule || '-'}</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-ink-faint uppercase block">Acte sélectionné</span>
              <span className="font-bold text-indigo-900 block">{lignePrestation.code} - {lignePrestation.libelle}</span>
              <span className="text-[11px] text-ink-muted block">Ticket mod.: {formatMoney(lPart)}</span>
            </div>
            <div className="text-right flex flex-col justify-center">
              <span className="text-[10px] font-bold text-ink-faint uppercase block">Part Assurance à Rembourser</span>
              <span className="font-mono text-base font-extrabold text-ink-strong">
                {formatMoney(lRemb)}
              </span>
            </div>
          </div>

          {/* Currently Linked Payments summary */}
          {currentLinkedLines.length > 0 ? (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold text-emerald-950">
                  Actuellement relié au Bordereau N° <strong className="font-mono">{currentLinkedLines[0].paiement.numeroBordereau}</strong> ({formatDate(currentLinkedLines[0].paiement.datePaiement)}) — Payé: {formatMoney(currentLinkedLines[0].ligne.totalPaye)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleUnlink(currentLinkedLines[0].paiement, currentLinkedLines[0].ligne)}
                className="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Unlink className="w-3 h-3" />
                <span>Délier la liaison</span>
              </button>
            </div>
          ) : (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center space-x-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span className="font-semibold">Cet acte n'est relié à aucun bordereau de règlement pour l'instant.</span>
            </div>
          )}
        </div>

        {/* Search & Filter Bar */}
        <div className="px-6 py-3 bg-surface border-b border-line shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(maskNom(e.target.value))}
              placeholder="Rechercher un règlement par N° Bordereau, Code Acte, Assuré ou Montant..."
              className="w-full pl-9 pr-3 py-1.5 bg-surface-muted border border-line rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-surface focus:outline-none transition-all uppercase"
            />
          </div>

          <label className="inline-flex items-center space-x-2 text-xs font-semibold text-ink select-none shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={filterUnlinkedOnly}
              onChange={(e) => setFilterUnlinkedOnly(e.target.checked)}
              className="rounded border-line-strong text-indigo-600 focus:ring-indigo-500 h-4 w-4"
            />
            <span>Afficher uniquement les règlements non reliés</span>
          </label>
        </div>

        {/* Settlement Lines List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-[250px]">
          {allSettlementCandidates.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-line rounded-2xl bg-surface-muted/50">
              <Receipt className="w-8 h-8 text-ink-faint mx-auto mb-2" />
              <p className="text-sm font-bold text-ink">Aucun bordereau de règlement correspondant</p>
              <p className="text-xs text-ink-muted max-w-md mx-auto mt-1">
                Importez les règlements ou décochez le filtre pour parcourir l'ensemble des règlements enregistrés.
              </p>
            </div>
          ) : (
            allSettlementCandidates.map(({ paiement: p, ligne: l, isPatientMatch, isCodeMatch, isAmountMatch, isCurrentlyLinked }) => {
              const isSelected = selectedPaiementId === p.id && selectedLignePaiementId === l.id;
              const pPaye = l.totalPaye || l.montantPaye || 0;

              return (
                <div
                  key={`${p.id}_${l.id}`}
                  onClick={() => handleSelectLine(p.id, l.id)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50/90 border-indigo-500 ring-2 ring-indigo-500/20 shadow-sm'
                      : isCurrentlyLinked
                      ? 'bg-emerald-50/60 border-emerald-300'
                      : 'bg-surface border-line hover:border-indigo-300 hover:bg-surface-muted/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start space-x-3">
                      <div className={`mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-line-strong bg-surface'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>

                      <div>
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="font-mono font-bold text-sm text-indigo-900">
                            Bordereau N° {p.numeroBordereau}
                          </span>
                          <span className="text-xs text-ink-muted">• {formatDate(p.datePaiement)}</span>
                          
                          {isCurrentlyLinked && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Actuellement relié</span>
                            </span>
                          )}

                          {isPatientMatch && !isCurrentlyLinked && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold border border-indigo-200">
                              <Sparkles className="w-3 h-3 text-indigo-600" />
                              <span>Assuré identique</span>
                            </span>
                          )}

                          {isCodeMatch && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-bold border border-sky-200">
                              <span>Même acte ({l.codeActe})</span>
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex items-center space-x-3 text-xs text-ink font-semibold">
                          <span>{l.nomAgent || l.nomBaseAssurance || 'Assuré'}</span>
                          {l.immatriculation && (
                            <span className="font-mono text-[11px] text-ink-muted">
                              Mat: {l.immatriculation}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-xs text-ink-muted font-mono">
                          Acte réglé : <span className="font-bold text-ink">{l.codeActe || 'CONS'}</span> ({l.libelleActe || 'Soins'})
                          {l.prestationNumero && (
                            <span className="ml-2 text-indigo-600">
                              • Facture reliée: {l.prestationNumero}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Financial details */}
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold text-ink-faint uppercase block">Montant Encaissé</span>
                      <span className="font-mono text-sm font-extrabold text-emerald-600 block">{formatMoney(pPaye)}</span>
                      {l.montantExclu > 0 && (
                        <span className="text-[10px] font-bold text-rose-600 block">Rejet: {formatMoney(l.montantExclu)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-surface-muted border-t border-line shrink-0 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-line-strong text-ink hover:bg-surface-hover text-xs font-bold transition-colors cursor-pointer"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!selectedPaiementId || !selectedLignePaiementId}
            onClick={handleConfirmLink}
            className="inline-flex items-center space-x-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-indigo-200 transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Valider la liaison</span>
          </button>
        </div>

      </div>
    </div>
  );
};
