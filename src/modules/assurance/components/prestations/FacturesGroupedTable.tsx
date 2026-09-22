import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronRight, 
  Eye, 
  Trash2,
  Sparkles, 
  AlertTriangle, 
  CalendarCheck, 
  Building2, 
  Users, 
  Activity, 
  CreditCard, 
  CheckCircle2, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  Receipt,
  Printer,
  Merge,
  ClipboardEdit,
  Ban
} from 'lucide-react';
import { GroupedFacture, FactureSortField } from '../PrestationsView';
import { formatDate, formatMoney } from '../../utils/formatters';
import { Personne, Prestation } from '../../types';
import { natureRemiseLabelCourt } from '../../../../utils/natureRemise';

interface FacturesGroupedTableProps {
  factures: GroupedFacture[];
  expandedFactureRows: Record<string, boolean>;
  toggleFactureRow: (num: string) => void;
  factureSortField: FactureSortField;
  factureSortDirection: 'asc' | 'desc';
  onSort: (field: FactureSortField) => void;
  onViewFacture: (facture: GroupedFacture) => void;
  onDeleteFacture?: (facture: GroupedFacture) => void;
  getPersonne: (id?: string) => Personne | undefined;
  getPrestationFinancials?: (p: Prestation) => { tot: number; mod: number; remb: number; totalPaye: number; totalExclu: number; resteAPayer: number; statut: string };
  onPrintPrestation?: (prestation: Prestation) => void;
  onFusionner?: (prestation: Prestation) => void;
  onEditPrestation?: (prestation: Prestation) => void;
  onDeletePrestation?: (prestation: Prestation) => void;
  onExcludePrestation?: (prestation: Prestation, maxExclu: number) => void;
}

export const FacturesGroupedTable: React.FC<FacturesGroupedTableProps> = ({
  factures,
  expandedFactureRows,
  toggleFactureRow,
  factureSortField,
  factureSortDirection,
  onSort,
  onViewFacture,
  onDeleteFacture,
  getPersonne,
  getPrestationFinancials,
  onPrintPrestation,
  onFusionner,
  onEditPrestation,
  onDeletePrestation,
  onExcludePrestation,
}) => {
  // Suivi des personnes traitées par la facturière (conservé en mémoire locale contre les coupures d'électricité)
  const [checkedPrestations, setCheckedPrestations] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('facturation_checked_prestations');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const togglePrestationChecked = (id: string) => {
    setCheckedPrestations((prev: Record<string, boolean>) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem('facturation_checked_prestations', JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };
  // Réduction (brut − net) : ticket modérateur par défaut ; la colonne ne
  // s'intitule « Remise » que si toutes les factures affichées sont concernées.
  const libelleReductionColonne = factures.length > 0 && factures.every(f => f.natureRemise === 'remise')
    ? 'Remise'
    : 'Ticket Mod.';

  const renderSortIcon = (field: FactureSortField) => {
    if (factureSortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />;
    }
    return factureSortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-indigo-600 font-bold ml-1" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-indigo-600 font-bold ml-1" />
    );
  };

  // Compute overall totals
  const totals = factures.reduce((acc, f) => {
    acc.totalFacture += f.totalFacture;
    acc.totalTicketMod += f.totalTicketMod;
    acc.totalARembourser += f.totalARembourser;
    acc.totalPaye += f.totalPaye;
    acc.resteAReclamer += f.resteAReclamer;
    acc.totalAssures += f.nombreAssures;
    acc.totalActes += f.nombreActes;
    return acc;
  }, {
    totalFacture: 0,
    totalTicketMod: 0,
    totalARembourser: 0,
    totalPaye: 0,
    resteAReclamer: 0,
    totalAssures: 0,
    totalActes: 0,
  });

  return (
    <div className="bg-surface rounded-xl border border-line shadow-2xs overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
      <div className="overflow-auto flex-1">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 z-10 bg-surface-muted text-ink uppercase text-[11px] font-semibold border-b border-line select-none shadow-2xs">
            <tr>
              <th className="py-3 px-2 w-8"></th>

              {/* N° Facture */}
              <th 
                onClick={() => onSort('numeroFacture')}
                className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${factureSortField === 'numeroFacture' ? 'bg-indigo-50/60 text-indigo-900 font-bold' : ''}`}
              >
                <div className="flex items-center">
                  <span>N° Facture</span>
                  {renderSortIcon('numeroFacture')}
                </div>
              </th>

              {/* Date */}
              <th 
                onClick={() => onSort('date')}
                className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${factureSortField === 'date' ? 'bg-indigo-50/60 text-indigo-900 font-bold' : ''}`}
              >
                <div className="flex items-center">
                  <span>Période / Date</span>
                  {renderSortIcon('date')}
                </div>
              </th>

              {/* Société / Sous-sociétés */}
              <th 
                onClick={() => onSort('societe')}
                className={`py-3 px-3 cursor-pointer group hover:bg-surface-hover/80 transition ${factureSortField === 'societe' ? 'bg-indigo-50/60 text-indigo-900 font-bold' : ''}`}
              >
                <div className="flex items-center">
                  <span>Société & Sous-Sociétés</span>
                  {renderSortIcon('societe')}
                </div>
              </th>

              {/* Assurés & Actes */}
              <th 
                onClick={() => onSort('nombreAssures')}
                className={`py-3 px-3 text-center cursor-pointer group hover:bg-surface-hover/80 transition ${factureSortField === 'nombreAssures' ? 'bg-indigo-50/60 text-indigo-900 font-bold' : ''}`}
              >
                <div className="flex items-center justify-center">
                  <span>Assurés / Actes</span>
                  {renderSortIcon('nombreAssures')}
                </div>
              </th>

              {/* Montant Brut */}
              <th 
                onClick={() => onSort('totalFacture')}
                className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${factureSortField === 'totalFacture' ? 'bg-indigo-50/60 text-indigo-900 font-bold' : ''}`}
              >
                <div className="flex items-center justify-end">
                  <span>Total Brut</span>
                  {renderSortIcon('totalFacture')}
                </div>
              </th>

              {/* Ticket Modérateur */}
              <th 
                onClick={() => onSort('totalTicketMod')}
                className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${factureSortField === 'totalTicketMod' ? 'bg-indigo-50/60 text-indigo-900 font-bold' : ''}`}
              >
                <div className="flex items-center justify-end" title="Nature de la réduction (total brut − net) : ticket modérateur à la charge de l'assuré, ou vraie remise accordée — réglable dans la gestion des sociétés">
                  <span>{libelleReductionColonne}</span>
                  {renderSortIcon('totalTicketMod')}
                </div>
              </th>

              {/* Part Assurance (À Rembourser) */}
              <th 
                onClick={() => onSort('totalARembourser')}
                className={`py-3 px-3 text-right cursor-pointer group hover:bg-surface-hover/80 transition ${factureSortField === 'totalARembourser' ? 'bg-indigo-50/60 text-indigo-900 font-bold' : ''}`}
              >
                <div className="flex items-center justify-end">
                  <span>Part Assurance</span>
                  {renderSortIcon('totalARembourser')}
                </div>
              </th>

              {/* Total Perçu (Encaissé) */}
              <th 
                onClick={() => onSort('totalPaye')}
                className={`py-3 px-3 text-right cursor-pointer group hover:bg-emerald-50/80 transition ${factureSortField === 'totalPaye' ? 'bg-emerald-100/70 text-emerald-950 font-bold' : 'text-emerald-800'}`}
              >
                <div className="flex items-center justify-end">
                  <span>Total Perçu</span>
                  {renderSortIcon('totalPaye')}
                </div>
              </th>

              {/* Montants Restant à Réclamer */}
              <th 
                onClick={() => onSort('resteAReclamer')}
                className={`py-3 px-3 text-right cursor-pointer group hover:bg-rose-50/80 transition ${factureSortField === 'resteAReclamer' ? 'bg-rose-100/70 text-rose-950 font-bold' : 'text-rose-800'}`}
              >
                <div className="flex items-center justify-end">
                  <span>Reste à Réclamer</span>
                  {renderSortIcon('resteAReclamer')}
                </div>
              </th>

              {/* Statut & Taux */}
              <th 
                onClick={() => onSort('statut')}
                className={`py-3 px-3 text-center cursor-pointer group hover:bg-surface-hover/80 transition ${factureSortField === 'statut' ? 'bg-indigo-50/60 text-indigo-900 font-bold' : ''}`}
              >
                <div className="flex items-center justify-center">
                  <span>Statut / Encaissement</span>
                  {renderSortIcon('statut')}
                </div>
              </th>

              {/* Actions */}
              <th className="py-3 px-3 text-center w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {factures.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-12 text-center text-ink-faint">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Receipt className="w-8 h-8 text-slate-300 stroke-1" />
                    <p className="text-sm font-medium text-ink-muted">Aucune facture correspondant à vos critères</p>
                    <p className="text-xs text-ink-faint">Modifiez vos filtres ou importez de nouvelles factures SALFA</p>
                  </div>
                </td>
              </tr>
            ) : (
              factures.map(facture => {
                const isExpanded = expandedFactureRows[facture.numeroFacture];

                return (
                  <React.Fragment key={facture.numeroFacture}>
                    <tr 
                      onClick={() => toggleFactureRow(facture.numeroFacture)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        onViewFacture(facture);
                      }}
                      className={`hover:bg-indigo-50/30 transition-colors cursor-pointer select-none ${
                        isExpanded ? 'bg-indigo-50/40' : ''
                      }`}
                      title="Clic : développer/réduire les bénéficiaires • Double-clic : ouvrir la vue détaillée de cette facture"
                    >
                      {/* Chevron */}
                      <td className="py-3 px-2 text-center text-ink-faint">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-indigo-600 inline-block" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-ink-faint inline-block" />
                        )}
                      </td>

                      {/* N° Facture */}
                      <td className="py-3 px-3 font-mono font-bold text-ink-strong">
                        <div className="flex items-center space-x-1.5">
                          <span>{facture.numeroFacture}</span>
                          {facture.prestations.some(p => p.sourceInvoiceId) && <span className="text-[10px] rounded bg-accent-soft text-accent px-1.5 py-0.5">Caisse · base commune</span>}
                          {facture.hasMatch && (
                            <span title="Rapprochement parfait date & montant avec un règlement" className="p-0.5 rounded bg-emerald-100 text-emerald-800">
                              <Sparkles className="w-3 h-3" />
                            </span>
                          )}
                          {facture.hasDuplicate && (
                            <span title="Attention: Autre facture avec même date & montant" className="p-0.5 rounded bg-amber-100 text-amber-800">
                              <AlertTriangle className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3 text-ink-secondary whitespace-nowrap">
                        {facture.dateMin ? (
                          facture.dateMin === facture.dateMax 
                            ? formatDate(facture.dateMin) 
                            : `${formatDate(facture.dateMin)} - ${formatDate(facture.dateMax)}`
                        ) : '-'}
                      </td>

                      {/* Société & Sous-sociétés */}
                      <td className="py-3 px-3">
                        <div className="font-semibold text-ink">{facture.societeNom}</div>
                        {facture.sousSocietes.length > 0 && (
                          <div className="text-[10px] text-ink-muted truncate max-w-[200px]" title={facture.sousSocietes.join(', ')}>
                            {facture.sousSocietes.join(', ')}
                          </div>
                        )}
                      </td>

                      {/* Assurés / Actes */}
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-hover text-ink text-[11px] font-semibold">
                          <Users className="w-3 h-3 text-ink-muted" />
                          <span>{facture.nombreAssures} pers.</span>
                          <span className="text-ink-faint">•</span>
                          <span>{facture.nombreActes} actes</span>
                        </span>
                      </td>

                      {/* Montant Brut */}
                      <td className="py-3 px-3 text-right font-mono font-medium text-ink-strong whitespace-nowrap">
                        {formatMoney(facture.totalFacture)}
                      </td>

                      {/* Ticket modérateur ou vraie remise (selon la société / l'assuré) */}
                      <td
                        className={`py-3 px-3 text-right font-mono whitespace-nowrap font-medium ${facture.natureRemise === 'remise' ? 'text-emerald-700' : 'text-amber-700'}`}
                        title={`${natureRemiseLabelCourt(facture.natureRemise)} : ${formatMoney(facture.totalTicketMod)}`}
                      >
                        {facture.natureRemise === 'remise' && <span className="text-[9px] font-bold uppercase mr-1 text-emerald-600">%</span>}
                        {formatMoney(facture.totalTicketMod)}
                      </td>

                      {/* Part Assurance (À Rembourser) */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-ink-strong whitespace-nowrap">
                        {formatMoney(facture.totalARembourser)}
                      </td>

                      {/* Total Perçu (Encaissé) - Highlighted */}
                      <td className="py-3 px-3 text-right font-mono font-extrabold text-emerald-700 bg-emerald-50/40 whitespace-nowrap">
                        {formatMoney(facture.totalPaye)}
                      </td>

                      {/* Reste à Réclamer - Highlighted */}
                      <td className="py-3 px-3 text-right font-mono font-extrabold whitespace-nowrap">
                        <span className={facture.resteAReclamer > 0 ? 'text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200' : 'text-ink-faint'}>
                          {formatMoney(facture.resteAReclamer)}
                        </span>
                      </td>

                      {/* Statut & Taux */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            facture.statut === 'Payé'
                              ? 'bg-emerald-100 text-emerald-800'
                              : facture.statut === 'Partiellement payé'
                              ? 'bg-sky-100 text-sky-800'
                              : facture.statut === 'Rejeté'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {facture.statut}
                          </span>
                          <div className="w-16 bg-surface-active rounded-full h-1.5 overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-300 ${
                                facture.tauxRecouvrement >= 100 ? 'bg-emerald-600' : 'bg-indigo-600'
                              }`} 
                              style={{ width: `${facture.tauxRecouvrement}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center space-x-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onViewFacture(facture)}
                            className="p-1.5 text-ink-faint hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                            title="Voir la synthèse complète de la facture"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {onDeleteFacture && (
                            <button
                              onClick={() => onDeleteFacture(facture)}
                              className={`p-1.5 rounded-lg transition cursor-pointer ${
                                facture.totalPaye > 0 || facture.bordereaux.length > 0
                                  ? 'text-slate-300 hover:text-amber-600 hover:bg-amber-50'
                                  : 'text-ink-faint hover:text-rose-600 hover:bg-rose-50'
                              }`}
                              title={
                                facture.totalPaye > 0 || facture.bordereaux.length > 0
                                  ? "Facture avec règlements (cliquer pour voir les détails de blocage)"
                                  : "Supprimer entièrement cette facture et toutes ses prescriptions"
                              }
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Sub-table: Insured beneficiaries under this facture */}
                    {isExpanded && (
                      <tr className="bg-surface-muted/90 border-y border-line">
                        <td colSpan={12} className="p-4 space-y-3">
                          <div className="bg-surface rounded-xl border border-line p-3.5 shadow-2xs space-y-3">
                            <div className="flex items-center justify-between border-b border-line-soft pb-2.5">
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-indigo-600" />
                                <span className="font-bold text-ink-strong text-xs uppercase tracking-wider">
                                  Bénéficiaires & Dossiers inclus dans la Facture {facture.numeroFacture} ({facture.prestations.length})
                                </span>
                              </div>
                              <div className="flex items-center gap-4 text-xs font-semibold">
                                <span className="text-ink-secondary">
                                  Total Brut : <strong className="font-mono text-ink-strong">{formatMoney(facture.totalFacture)}</strong>
                                </span>
                                <span className="text-emerald-700">
                                  Perçu : <strong className="font-mono">{formatMoney(facture.totalPaye)}</strong>
                                </span>
                                <span className={facture.resteAReclamer > 0 ? 'text-rose-700' : 'text-ink-muted'}>
                                  Restant : <strong className="font-mono">{formatMoney(facture.resteAReclamer)}</strong>
                                </span>
                              </div>
                            </div>

                            {/* Insured Beneficiaries Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="text-ink-muted border-b border-line-soft text-[10px] uppercase font-semibold">
                                    <th className="py-2 px-2 text-center w-8" title="Cocher pour marquer la personne comme traitée (conservé en mémoire contre les coupures d'électricité)">Traitée</th>
                                    <th className="py-2 px-2.5">Assuré / Client</th>
                                    <th className="py-2 px-2.5">Date</th>
                                    <th className="py-2 px-2.5">Sous-soc.</th>
                                    <th className="py-2 px-2.5 text-right">Montant Brut</th>
                                    <th className="py-2 px-2.5 text-right">{natureRemiseLabelCourt(facture.natureRemise)}</th>
                                    <th className="py-2 px-2.5 text-right font-bold text-indigo-900 dark:text-indigo-200">Part Assurance</th>
                                    <th className="py-2 px-2.5 text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {facture.prestations.map((p, pIdx) => {
                                    const pers = getPersonne(p.personneId);
                                    const pNom = p.nomAgent || pers?.nomPrenom || p.matricule || 'Assuré';
                                    const pMat = pers?.matricule || p.matricule || '-';
                                    const pId = p.id || `prest-${pIdx}`;
                                    const isProcessed = !!checkedPrestations[pId];
                                    
                                    const fin = getPrestationFinancials ? getPrestationFinancials(p) : {
                                      tot: p.montantTotal ?? p.totalPrestation ?? 0,
                                      mod: p.ticketModerateur ?? p.participation ?? 0,
                                      remb: p.montantARembourser ?? Math.max(0, (p.montantTotal ?? p.totalPrestation ?? 0) - (p.ticketModerateur ?? p.participation ?? 0)),
                                      totalPaye: p.totalPaye ?? 0,
                                      totalExclu: p.montantExclu ?? 0,
                                      resteAPayer: p.resteAPayer ?? Math.max(0, (p.montantARembourser ?? Math.max(0, (p.montantTotal ?? p.totalPrestation ?? 0) - (p.ticketModerateur ?? p.participation ?? 0))) - (p.totalPaye ?? 0) - (p.montantExclu ?? 0)),
                                      statut: p.statut || 'En attente'
                                    };

                                    const pTot = fin.tot;
                                    const pPart = fin.mod;
                                    const pRemb = fin.remb;
                                    const pReste = fin.resteAPayer;

                                    return (
                                      <tr 
                                        key={pId} 
                                        onDoubleClick={(e) => {
                                          e.stopPropagation();
                                          if (onEditPrestation) onEditPrestation(p);
                                        }}
                                        className={`transition cursor-pointer select-none ${
                                          isProcessed ? 'bg-emerald-50/70 hover:bg-emerald-100/70 border-l-4 border-emerald-500' : 'hover:bg-surface-muted/80'
                                        }`}
                                        title={isProcessed ? "Dossier coché / traité — Double-clic : modifier la prescription" : "Double-clic : modifier la prescription — ajouter une vente omise ou ordonnance externe"}
                                      >
                                        <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                                          <input 
                                            type="checkbox"
                                            checked={isProcessed}
                                            onChange={() => togglePrestationChecked(pId)}
                                            className="w-4 h-4 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                            title={isProcessed ? "Décocher" : "Marquer comme traité (sauvegardé contre coupure élec)"}
                                          />
                                        </td>
                                        <td className="py-2 px-2.5">
                                          <div className={`font-bold ${isProcessed ? 'text-emerald-950' : 'text-ink-strong'}`}>
                                            {pNom}
                                            {isProcessed && <span className="ml-1.5 text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded-full">Traité</span>}
                                          </div>
                                          <div className="text-[10px] text-ink-muted font-mono">Mat: {pMat}</div>
                                        </td>
                                        <td className="py-2 px-2.5 text-ink-secondary whitespace-nowrap">
                                          {formatDate(p.date)}
                                        </td>
                                        <td className="py-2 px-2.5 text-ink-secondary">
                                          {p.sousSociete || '-'}
                                        </td>
                                        <td className="py-2 px-2.5 text-right font-mono text-ink-strong">
                                          {formatMoney(pTot)}
                                        </td>
                                        <td className="py-2 px-2.5 text-right font-mono text-amber-700">
                                          {formatMoney(pPart)}
                                        </td>
                                        <td className="py-2 px-2.5 text-right font-mono font-bold text-indigo-700 dark:text-indigo-300">
                                          {formatMoney(pRemb)}
                                        </td>
                                        <td className="py-2 px-2.5 text-right whitespace-nowrap">
                                          <div className="flex items-center justify-end space-x-1" onClick={(e) => e.stopPropagation()}>
                                            {onPrintPrestation && (
                                              <button
                                                type="button"
                                                onClick={() => onPrintPrestation(p)}
                                                title="Imprimer la facture"
                                                aria-label={`Imprimer la facture ${p.numeroFacture}`}
                                                className="p-1.5 text-accent hover:bg-accent-soft rounded-lg cursor-pointer transition"
                                              >
                                                <Printer className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                            {onFusionner && (
                                              <button
                                                type="button"
                                                onClick={() => onFusionner(p)}
                                                title="Fusionner avec une autre facture (regrouper deux factures, même à des dates différentes, en une seule)"
                                                aria-label={`Fusionner la facture ${p.numeroFacture}`}
                                                className="p-1.5 text-ink-faint hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer transition"
                                              >
                                                <Merge className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                            {onEditPrestation && (
                                              <button
                                                type="button"
                                                onClick={() => onEditPrestation(p)}
                                                title="Modifier la prescription — ajouter une VENTE OMISE (stock pharmacie régularisé) ou une ORDONNANCE EXTERNE (sans impact stock)"
                                                aria-label={`Modifier la prescription ${p.numeroFacture}`}
                                                className="p-1.5 text-ink-faint hover:text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer transition"
                                              >
                                                <ClipboardEdit className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                            {onExcludePrestation && pReste > 0 && (
                                              <button
                                                type="button"
                                                onClick={() => onExcludePrestation(p, pReste)}
                                                title="Rejeter / Exclure le reste à payer de cette facture"
                                                className="p-1.5 text-ink-faint hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition"
                                              >
                                                <Ban className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                            {onDeletePrestation && (
                                              <button
                                                type="button"
                                                onClick={() => onDeletePrestation(p)}
                                                title="Supprimer le dossier de soins"
                                                aria-label={`Supprimer le dossier ${p.numeroFacture}`}
                                                className="p-1.5 text-ink-faint hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {/* Règlements rattachés sur cette facture */}
                            {facture.bordereaux.length > 0 && (
                              <div className="bg-emerald-50/70 rounded-lg border border-emerald-200 p-2.5 space-y-1.5">
                                <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center justify-between">
                                  <span className="flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Bordereaux de Règlements rattachés ({facture.bordereaux.length})</span>
                                  </span>
                                  <span className="font-mono text-emerald-800 font-extrabold">
                                    Total réglé : {formatMoney(facture.totalPaye)}
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {facture.bordereaux.map((b, bIdx) => (
                                    <div key={bIdx} className="bg-surface rounded-md border border-emerald-200 p-2 text-xs flex items-center justify-between">
                                      <div>
                                        <div className="font-bold text-ink font-mono text-[11px]">{b.bordereau}</div>
                                        <div className="text-[10px] text-ink-muted">{formatDate(b.date)} • {b.mode}</div>
                                      </div>
                                      <div className="font-mono font-bold text-emerald-700 text-right">
                                        {formatMoney(b.montant)}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bar de Totaux Généraux toujours visible en bas de la page */}
      <div className="sticky bottom-0 z-20 bg-slate-900 text-white border-t border-slate-800 px-4 py-3 shadow-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-bold uppercase text-slate-300 tracking-wider">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
          <span>Total Synthèse Factures ({factures.length} factures / {totals.totalAssures} assurés)</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 sm:gap-6 font-mono font-bold">
          <div className="text-right">
            <span className="text-[10px] uppercase font-sans text-ink-faint block font-normal">Total Brut</span>
            <span className="text-slate-100">{formatMoney(totals.totalFacture)}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-sans text-amber-400 block font-normal">Ticket Mod.</span>
            <span className="text-amber-300">{formatMoney(totals.totalTicketMod)}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-sans text-indigo-300 block font-normal">Part Assurance</span>
            <span className="text-indigo-200">{formatMoney(totals.totalARembourser)}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-sans text-emerald-400 block font-normal">Total Perçu</span>
            <span className="text-emerald-400">{formatMoney(totals.totalPaye)}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase font-sans text-rose-400 block font-normal">Reste à Réclamer</span>
            <span className={totals.resteAReclamer > 0 ? 'text-rose-400 font-extrabold' : 'text-ink-faint'}>
              {formatMoney(totals.resteAReclamer)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
