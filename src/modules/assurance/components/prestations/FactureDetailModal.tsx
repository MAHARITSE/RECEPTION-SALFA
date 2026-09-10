import React from 'react';
import { 
  X, 
  FileText, 
  Building2, 
  Calendar, 
  Users, 
  Activity, 
  CheckCircle2, 
  AlertCircle, 
  Receipt,
  Download,
  CreditCard,
  Trash2,
  Link2
} from 'lucide-react';
import { GroupedFacture } from '../PrestationsView';
import { formatDate, formatMoney } from '../../utils/formatters';
import { Personne, Societe, Prestation, LignePrestation } from '../../types';

interface FactureDetailModalProps {
  facture: GroupedFacture | null;
  onClose: () => void;
  onDeleteFacture?: (facture: GroupedFacture) => void;
  getPersonne: (id?: string) => Personne | undefined;
  getSocieteNom: (id?: string) => string;
  onChangeLiaison?: (prestation: Prestation, ligne: LignePrestation) => void;
  getPrestationFinancials?: (p: Prestation) => { tot: number; mod: number; remb: number; totalPaye: number; totalExclu: number; resteAPayer: number; statut: string };
  getLineFinancials?: (l: LignePrestation, p: Prestation) => { lBrut: number; lPart: number; lARemb: number; lTotalPaye: number; lExclu: number; lReste: number; statut: string };
}

export const FactureDetailModal: React.FC<FactureDetailModalProps> = ({
  facture,
  onClose,
  onDeleteFacture,
  getPersonne,
  getSocieteNom,
  onChangeLiaison,
  getPrestationFinancials,
  getLineFinancials,
}) => {
  if (!facture) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-surface rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line-soft pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-700">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-ink-strong font-mono">
                  Facture N° {facture.numeroFacture}
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
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
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                Synthèse financière et récapitulatif détaillé des bénéficiaires et actes rattachés
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-ink-faint hover:text-ink hover:bg-surface-hover transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Facture Info Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface-muted p-3 rounded-xl border border-line">
            <div className="text-[11px] text-ink-muted font-semibold flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Société / Garant</span>
            </div>
            <div className="font-bold text-ink-strong text-xs mt-1 truncate">
              {facture.societeNom}
            </div>
            <div className="text-[10px] text-ink-muted mt-0.5 truncate">
              {facture.sousSocietes.length > 0 ? facture.sousSocietes.join(', ') : 'Général'}
            </div>
          </div>

          <div className="bg-surface-muted p-3 rounded-xl border border-line">
            <div className="text-[11px] text-ink-muted font-semibold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>Date(s) de Soins</span>
            </div>
            <div className="font-bold text-ink-strong text-xs mt-1">
              {facture.dateMin ? (
                facture.dateMin === facture.dateMax 
                  ? formatDate(facture.dateMin) 
                  : `${formatDate(facture.dateMin)} - ${formatDate(facture.dateMax)}`
              ) : '-'}
            </div>
            <div className="text-[10px] text-ink-muted mt-0.5">
              {facture.dates.length} date(s) distincte(s)
            </div>
          </div>

          <div className="bg-surface-muted p-3 rounded-xl border border-line">
            <div className="text-[11px] text-ink-muted font-semibold flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>Bénéficiaires & Actes</span>
            </div>
            <div className="font-bold text-ink-strong text-xs mt-1">
              {facture.nombreAssures} Assuré(s)
            </div>
            <div className="text-[10px] text-ink-muted mt-0.5">
              {facture.nombreActes} acte(s) médical(aux)
            </div>
          </div>

          <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
            <div className="text-[11px] text-emerald-800 font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Taux d'Encaissement</span>
            </div>
            <div className="font-extrabold text-emerald-700 text-sm mt-1 font-mono">
              {facture.tauxRecouvrement}%
            </div>
            <div className="text-[10px] text-emerald-700 mt-0.5 font-medium">
              {facture.totalARembourser > 0 ? `${formatMoney(facture.totalPaye)} perçu` : 'Régularisé'}
            </div>
          </div>
        </div>

        {/* Financial Highlights Breakdown */}
        <div className="bg-slate-900 text-white rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <div className="text-[10px] uppercase font-bold text-ink-faint tracking-wider">Total Facturé (Brut)</div>
            <div className="text-base font-bold font-mono mt-0.5">{formatMoney(facture.totalFacture)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Ticket Modérateur</div>
            <div className="text-base font-bold font-mono text-amber-300 mt-0.5">{formatMoney(facture.totalTicketMod)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">Part Assurance Réclamée</div>
            <div className="text-base font-bold font-mono text-sky-200 mt-0.5">{formatMoney(facture.totalARembourser)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Total Perçu (Encaissé)</div>
            <div className="text-base font-extrabold font-mono text-emerald-400 mt-0.5">{formatMoney(facture.totalPaye)}</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">Restant à Réclamer</div>
            <div className={`text-base font-extrabold font-mono mt-0.5 ${facture.resteAReclamer > 0 ? 'text-rose-400' : 'text-slate-300'}`}>
              {formatMoney(facture.resteAReclamer)}
            </div>
          </div>
        </div>

        {/* Règlements rattachés */}
        {facture.bordereaux.length > 0 && (
          <div className="bg-emerald-50/60 rounded-xl border border-emerald-200 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-950 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>Bordereaux de Paiement Rattachés ({facture.bordereaux.length})</span>
              </span>
              <span className="font-mono text-emerald-800 font-extrabold">
                Total : {formatMoney(facture.totalPaye)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {facture.bordereaux.map((b, idx) => (
                <div key={idx} className="bg-surface p-2.5 rounded-lg border border-emerald-200 text-xs flex items-center justify-between">
                  <div>
                    <div className="font-mono font-bold text-ink">{b.bordereau}</div>
                    <div className="text-[10px] text-ink-muted">{formatDate(b.date)} • {b.mode}</div>
                    {b.nomAgent && <div className="text-[10px] text-indigo-700 font-medium truncate">{b.nomAgent}</div>}
                  </div>
                  <div className="font-mono font-bold text-emerald-700 text-right">
                    {formatMoney(b.montant)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Insured Patients List & Medical Acts in this Invoice */}
        <div className="space-y-3">
          <h4 className="font-bold text-xs text-ink uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" />
            <span>Détail des Assurés & Actes Médicaux ({facture.prestations.length} dossiers)</span>
          </h4>

          <div className="space-y-3">
            {facture.prestations.map((p, pIdx) => {
              const pers = getPersonne(p.personneId);
              const pNom = p.nomAgent || pers?.nomPrenom || p.matricule || 'Assuré';
              const pMat = pers?.matricule || p.matricule || '-';

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
              const pPaye = fin.totalPaye;
              const pReste = fin.resteAPayer;

              return (
                <div key={p.id || pIdx} className="bg-surface-muted/80 rounded-xl border border-line p-3 text-xs space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-line">
                    <div>
                      <span className="font-bold text-ink-strong text-xs">{pNom}</span>
                      <span className="text-ink-muted text-[11px] ml-2">Matricule: <strong className="font-mono text-ink">{pMat}</strong></span>
                      {p.sousSociete && (
                        <span className="text-[11px] text-indigo-600 font-medium ml-2">({p.sousSociete})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-ink-secondary">Date : <strong>{formatDate(p.date)}</strong></span>
                      <span className="text-ink-strong">Total : <strong className="font-mono">{formatMoney(pTot)}</strong></span>
                      <span className="text-emerald-700">Perçu : <strong className="font-mono">{formatMoney(pPaye)}</strong></span>
                      <span className={pReste > 0 ? 'text-rose-700' : 'text-ink-muted'}>
                        Reste : <strong className="font-mono">{formatMoney(pReste)}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Lignes d'actes */}
                  {p.lignes && p.lignes.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="text-ink-muted border-b border-line">
                            <th className="py-1 px-2">Code</th>
                            <th className="py-1 px-2">Description de l'acte</th>
                            <th className="py-1 px-2 text-right">Montant Brut</th>
                            <th className="py-1 px-2 text-right">Ticket Mod.</th>
                            <th className="py-1 px-2 text-right">Part Assurance</th>
                            <th className="py-1 px-2 text-right text-emerald-700">Payé</th>
                            <th className="py-1 px-2 text-right text-rose-600">Rejeté</th>
                            <th className="py-1 px-2 text-right text-rose-700">Reste</th>
                            {onChangeLiaison && <th className="py-1 px-2 text-center">Liaison</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-surface">
                          {p.lignes.map((l, lIdx) => {
                            const lFin = getLineFinancials ? getLineFinancials(l, p) : {
                              lBrut: l.totalPrestation || 0,
                              lPart: l.ticketModerateur || 0,
                              lARemb: Math.max(0, (l.totalPrestation || 0) - (l.ticketModerateur || 0)),
                              lTotalPaye: l.totalPaye || 0,
                              lExclu: l.montantExclu || 0,
                              lReste: Math.max(0, (l.totalPrestation || 0) - (l.ticketModerateur || 0) - (l.totalPaye || 0) - (l.montantExclu || 0)),
                              statut: l.statut || 'En attente'
                            };

                            const lBrut = lFin.lBrut;
                            const lPart = lFin.lPart;
                            const lRemb = lFin.lARemb;
                            const lPaye = lFin.lTotalPaye;
                            const lExclu = lFin.lExclu;
                            const lReste = lFin.lReste;

                            return (
                              <tr key={l.id || lIdx}>
                                <td className="py-1.5 px-2 font-mono font-bold text-indigo-700">{l.code}</td>
                                <td className="py-1.5 px-2 text-ink">{l.libelle || '-'}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-ink-strong">{formatMoney(lBrut)}</td>
                                <td className="py-1.5 px-2 text-right font-mono text-amber-700">{formatMoney(lPart)}</td>
                                <td className="py-1.5 px-2 text-right font-mono font-bold text-ink-strong">{formatMoney(lRemb)}</td>
                                <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-600">{formatMoney(lPaye)}</td>
                                <td className="py-1.5 px-2 text-right font-mono font-bold text-rose-600">{formatMoney(lExclu)}</td>
                                <td className="py-1.5 px-2 text-right font-mono font-bold text-rose-600">{formatMoney(lReste)}</td>
                                {onChangeLiaison && (
                                  <td className="py-1.5 px-2 text-center">
                                    <button
                                      type="button"
                                      onClick={() => onChangeLiaison(p, l)}
                                      className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors inline-flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                                      title="Changer la liaison avec un règlement"
                                    >
                                      <Link2 className="w-3 h-3 text-indigo-600" />
                                      <span>Relier</span>
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-line-soft">
          <div>
            {onDeleteFacture && (
              <button
                type="button"
                onClick={() => {
                  onDeleteFacture(facture);
                  onClose();
                }}
                className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  facture.totalPaye > 0 || facture.bordereaux.length > 0
                    ? 'border border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100'
                    : 'border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>
                  {facture.totalPaye > 0 || facture.bordereaux.length > 0
                    ? 'Suppression verrouillée (Règlement actif)'
                    : 'Supprimer toute la facture en cascade'}
                </span>
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-sm transition cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};
