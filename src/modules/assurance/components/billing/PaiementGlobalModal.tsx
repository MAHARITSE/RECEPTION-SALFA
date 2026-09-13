import { useMemo, useState } from 'react';
import { AlertTriangle, Banknote, CalendarDays, Info, X } from 'lucide-react';
import type { BillingDocument } from '../../monthlyBilling';
import { localBillingDate } from '../../monthlyBilling';
import type { Paiement, Prestation, Societe } from '../../types';
import { creerPaiementGlobal, numeroBordereauPropose, repartitionReglementGlobal } from '../../utils/reglementGlobal';
import { formatDate, formatMoney, generateId, getCurrentTimestamp } from '../../utils/formatters';

const MODES_PAIEMENT: Paiement['modePaiement'][] = ['Virement bancaire', 'Chèque', 'Espèces', 'Mobile Money', 'Autre'];

interface Props {
  societe: Societe;
  /** Mois de facturation (AAAA-MM). */
  month: string;
  /** Numéro de la facture mensuelle si elle a déjà été émise. */
  numeroFactureMensuelle?: string;
  destinataire: string;
  documents: BillingDocument[];
  estPrestation: (doc: BillingDocument) => boolean;
  prestations: Prestation[];
  numerosBordereauxExistants: string[];
  onClose: () => void;
  onEnregistrer: (paiement: Paiement) => void;
}

/**
 * Règlement d'un PAYEUR GLOBAL : la société règle la facture mensuelle en une
 * seule fois, sans distinction d'assuré ni d'acte. Le montant réglé est réparti
 * FIFO (facture la plus ancienne d'abord) sur les prescriptions du mois et
 * enregistré comme bordereau de règlement validé.
 */
export function PaiementGlobalModal({ societe, month, numeroFactureMensuelle, destinataire, documents, estPrestation, prestations, numerosBordereauxExistants, onClose, onEnregistrer }: Props) {
  const repartitionInitiale = useMemo(() => repartitionReglementGlobal(documents, Infinity, estPrestation), [documents, estPrestation]);
  const soldeReglementable = repartitionInitiale.soldeImputable;
  const [montant, setMontant] = useState(String(soldeReglementable || ''));
  const [datePaiement, setDatePaiement] = useState(localBillingDate(new Date().toISOString()));
  const [modePaiement, setModePaiement] = useState<Paiement['modePaiement']>('Virement bancaire');
  const [bordereau, setBordereau] = useState(() => numeroBordereauPropose(societe.code, month, numerosBordereauxExistants));
  const [notes, setNotes] = useState('');
  const [erreur, setErreur] = useState('');

  const valeurMontant = Number(montant.replace(',', '.'));
  const montantValide = Number.isFinite(valeurMontant) && valeurMontant > 0 && valeurMontant <= soldeReglementable + 0.001;
  const repartition = useMemo(() => repartitionReglementGlobal(documents, montantValide ? valeurMontant : 0, estPrestation), [documents, valeurMontant, montantValide, estPrestation]);
  const piecesHorsPrescription = repartitionInitiale.imputations.filter(i => !i.imputable && i.solde > 0);
  const bordereauDoublon = numerosBordereauxExistants.some(n => (n || '').replace(/[\s\-\_\.\/]/g, '').toUpperCase() === bordereau.replace(/[\s\-\_\.\/]/g, '').toUpperCase());

  function enregistrer() {
    if (!montantValide) { setErreur(`Le montant réglé doit être supérieur à 0 et ne pas dépasser le solde de ${formatMoney(soldeReglementable)}.`); return; }
    if (!datePaiement) { setErreur('Indiquez la date du paiement.'); return; }
    if (!bordereau.trim()) { setErreur('Indiquez le numéro de bordereau du règlement.'); return; }
    if (bordereauDoublon) { setErreur(`Le bordereau N° « ${bordereau} » existe déjà. Utilisez une référence unique.`); return; }
    const paiement = creerPaiementGlobal({
      societe, month, numeroFactureMensuelle, montant: valeurMontant, datePaiement, modePaiement,
      numeroBordereau: bordereau.trim(), notes: notes.trim() || undefined,
      repartition, prestations, generateId, horodatage: getCurrentTimestamp(),
    });
    onEnregistrer(paiement);
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[92vh]" role="dialog" aria-label={`Enregistrer le paiement ${destinataire} ${month}`}>
        {/* En-tête */}
        <div className="flex items-start justify-between gap-3 border-b border-line-soft px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300"><Banknote className="w-6 h-6" /></div>
            <div>
              <h3 className="text-lg font-bold text-ink-strong">Enregistrer un paiement</h3>
              <p className="text-xs text-ink-muted mt-0.5">{destinataire} — {month}{numeroFactureMensuelle ? ` — Facture ${numeroFactureMensuelle}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="p-2 rounded-xl text-ink-faint hover:text-ink hover:bg-surface-hover transition cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        {/* Corps */}
        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="bg-surface-hover p-2 rounded-lg"><span className="text-[10px] text-ink-muted block">Part société facturée</span><span className="font-bold text-ink">{formatMoney(documents.reduce((s, d) => s + d.payable, 0))}</span></div>
            <div className="bg-emerald-50 p-2 rounded-lg"><span className="text-[10px] text-emerald-700 block">Solde à régler</span><span className="font-bold text-emerald-800">{formatMoney(soldeReglementable)}</span></div>
            <div className="bg-indigo-50 p-2 rounded-lg"><span className="text-[10px] text-indigo-700 block">Après ce règlement</span><span className="font-bold text-indigo-800">{formatMoney(Math.max(0, Math.round((soldeReglementable - (montantValide ? valeurMontant : 0)) * 100) / 100))}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-ink block">Montant réglé
              <input type="number" min={0} step="0.01" value={montant} onChange={e => { setMontant(e.target.value); setErreur(''); }}
                aria-label="Montant réglé" className="mt-1 w-full rounded-lg border border-line bg-field p-2.5 font-mono text-sm" autoFocus />
            </label>
            <label className="text-xs font-semibold text-ink block">Date du paiement
              <input type="date" value={datePaiement} onChange={e => setDatePaiement(e.target.value)}
                aria-label="Date du paiement" className="mt-1 w-full rounded-lg border border-line bg-field p-2.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-ink block">Mode de paiement
              <select value={modePaiement} onChange={e => setModePaiement(e.target.value as Paiement['modePaiement'])}
                aria-label="Mode de paiement" className="mt-1 w-full rounded-lg border border-line bg-field p-2.5 text-sm cursor-pointer">
                {MODES_PAIEMENT.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-ink block">N° bordereau / référence
              <input type="text" value={bordereau} onChange={e => { setBordereau(e.target.value); setErreur(''); }}
                aria-label="Numéro de bordereau" placeholder="REG-SOC-2609-001"
                className={`mt-1 w-full rounded-lg border bg-field p-2.5 font-mono text-sm ${bordereauDoublon ? 'border-rose-400' : 'border-line'}`} />
              {bordereauDoublon && <span className="mt-1 block text-[11px] font-normal text-rose-700">Ce numéro de bordereau existe déjà.</span>}
            </label>
          </div>

          <label className="text-xs font-semibold text-ink block">Notes (optionnel)
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} aria-label="Notes du règlement"
              placeholder="Ex : virement reçu sur le compte…"
              className="mt-1 w-full rounded-lg border border-line bg-field p-2.5 text-sm" />
          </label>

          {piecesHorsPrescription.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{piecesHorsPrescription.length} pièce(s) de vente directe Caisse (solde {formatMoney(piecesHorsPrescription.reduce((s, i) => s + i.solde, 0))}) ne peuvent pas être imputées par ce règlement assurance. Encaissez-les depuis la Caisse.</span>
            </p>
          )}

          {/* Imputation prévisionnelle (FIFO) */}
          <div className="rounded-xl border border-line overflow-hidden">
            <p className="flex items-center gap-1.5 px-3 py-2 bg-surface-muted text-[11px] font-bold text-ink-secondary uppercase tracking-wide">
              <CalendarDays className="w-3.5 h-3.5" /> Imputation du règlement — facture la plus ancienne d'abord
            </p>
            <table className="w-full text-left text-xs" aria-label="Imputation du règlement par facture">
              <thead className="bg-surface text-ink-muted"><tr>{['Facture', 'Date', 'Client', 'Solde', 'Imputé'].map(l => <th key={l} className="px-3 py-1.5 font-semibold">{l}</th>)}</tr></thead>
              <tbody>
                {repartition.imputations.map(i => (
                  <tr key={i.doc.id} className="border-t border-line-soft">
                    <td className="px-3 py-1.5 font-mono">{i.doc.number}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(i.doc.date)}</td>
                    <td className="px-3 py-1.5">{i.doc.client}{!i.imputable && <span className="ml-1 text-[10px] text-amber-700">(vente Caisse)</span>}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{formatMoney(i.solde)}</td>
                    <td className={`px-3 py-1.5 whitespace-nowrap font-mono font-semibold ${i.montant > 0 ? 'text-emerald-700' : 'text-ink-faint'}`}>{formatMoney(i.montant)}</td>
                  </tr>
                ))}
                {!repartition.imputations.length && <tr><td colSpan={5} className="px-3 py-4 text-center text-ink-muted italic">Aucune facture à régler pour ce mois.</td></tr>}
              </tbody>
            </table>
          </div>

          {erreur && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{erreur}</p>}
          {!erreur && soldeReglementable <= 0 && (
            <p className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
              <Info className="w-4 h-4 shrink-0" /> La facturation de ce mois est déjà soldée : aucun paiement n'est nécessaire.
            </p>
          )}
        </div>

        {/* Pied */}
        <div className="flex items-center justify-end gap-3 border-t border-line-soft px-6 py-4">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold border border-line hover:bg-surface-hover transition cursor-pointer">Annuler</button>
          <button type="button" onClick={enregistrer} disabled={!montantValide || !datePaiement || !bordereau.trim() || bordereauDoublon}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            <Banknote className="w-4 h-4" /> Enregistrer le paiement ({formatMoney(montantValide ? valeurMontant : 0)})
          </button>
        </div>
      </div>
    </div>
  );
}
