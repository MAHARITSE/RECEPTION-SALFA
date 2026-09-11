import { useState } from 'react';
import { ChevronDown, ChevronRight, Printer, Receipt, AlertTriangle } from 'lucide-react';
import type { BillingDocument } from '../../monthlyBilling';
import type { BillingFactureGroup } from '../../monthlyBilling';

interface Props {
  factures: BillingFactureGroup[];
  formatMoney: (value: number) => string;
  /** Vrai si le numéro ne suit pas la numérotation officielle en vigueur. */
  isOfficialNumber: (number: string) => boolean;
  onPrint: (document: BillingDocument) => void;
}

const statutStyles: Record<BillingFactureGroup['statut'], string> = {
  'Payé': 'bg-emerald-100 text-emerald-800 border-emerald-300',
  'Partiellement payé': 'bg-amber-100 text-amber-800 border-amber-300',
  'En attente': 'bg-slate-100 text-slate-700 border-slate-300',
  'Rejeté': 'bg-rose-100 text-rose-800 border-rose-300',
};

/**
 * Vue « Par Facture » de la Facturation : une ligne par numéro de facture,
 * mêmes repères que la vue Prestations du suivi assurance (période, actes,
 * total brut, ticket modérateur, part à réclamer, perçu, reste, taux, statut),
 * avec le détail des actes dépliable.
 */
export function FacturationParFactureTable({ factures, formatMoney, isOfficialNumber, onPrint }: Props) {
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setOuverts(prev => ({ ...prev, [key]: !prev[key] }));

  const totaux = factures.reduce((acc, f) => ({
    total: acc.total + f.total, copay: acc.copay + f.copay, payable: acc.payable + f.payable,
    paid: acc.paid + f.paid, rejected: acc.rejected + f.rejected, remaining: acc.remaining + f.remaining,
  }), { total: 0, copay: 0, payable: 0, paid: 0, rejected: 0, remaining: 0 });

  if (!factures.length) {
    return <p className="rounded-xl border border-line bg-surface p-6 text-center text-sm text-ink-muted">Aucune facture pour cette sélection.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface" data-testid="billing-par-facture-view">
      <table className="w-full text-left text-xs" aria-label="Factures regroupées par numéro">
        <thead className="bg-surface-muted text-ink-secondary">
          <tr>
            {['N° Facture', 'Client / Société', 'Période', 'Actes', 'Total brut', 'Ticket modérateur', 'Part à réclamer', 'Perçu', 'Reste', 'Taux', 'Statut', 'Impression'].map(label => (
              <th className="p-3 whitespace-nowrap" key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {factures.map(f => {
            const key = f.number.toUpperCase();
            const ouvert = !!ouverts[key];
            const officiel = isOfficialNumber(f.number);
            return (
              <>
                <tr key={key} className="border-t border-line hover:bg-surface-hover">
                  <td className="p-3 whitespace-nowrap">
                    <button type="button" onClick={() => toggle(key)} className="flex items-center gap-1 font-mono font-semibold cursor-pointer" aria-expanded={ouvert}>
                      {ouvert ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      {f.number}
                    </button>
                    {!officiel && (
                      <span className="mt-1 flex items-center gap-1 text-[10px] font-bold text-amber-700" title="Numéro d’un ancien format : à mettre à jour">
                        <AlertTriangle size={11} /> ancien format
                      </span>
                    )}
                    {f.matricule && <span className="block text-ink-muted">Mat. {f.matricule}</span>}
                  </td>
                  <td className="p-3">
                    <span className="font-semibold text-ink-strong">{f.client}</span>
                    {f.companyName && <span className="block text-ink-muted">{f.companyName}{f.subCompany ? ` / ${f.subCompany}` : ''}</span>}
                    {f.dossier && <span className="block text-ink-faint">{f.dossier}</span>}
                  </td>
                  <td className="p-3 whitespace-nowrap">{f.dateMin === f.dateMax ? f.dateMin : `${f.dateMin} → ${f.dateMax}`}</td>
                  <td className="p-3 text-center">{f.actes}</td>
                  <td className="p-3 whitespace-nowrap">{formatMoney(f.total)}</td>
                  <td className="p-3 whitespace-nowrap">{formatMoney(f.copay)}</td>
                  <td className="p-3 whitespace-nowrap font-semibold">{formatMoney(f.payable)}</td>
                  <td className="p-3 whitespace-nowrap text-emerald-700">{formatMoney(f.paid)}</td>
                  <td className="p-3 whitespace-nowrap text-amber-700">{formatMoney(f.remaining)}</td>
                  <td className="p-3 whitespace-nowrap">{f.tauxRecouvrement}%</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statutStyles[f.statut]}`}>{f.statut}</span>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => f.documents.forEach(onPrint)}
                      aria-label={`Imprimer la facture ${f.number}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 hover:bg-accent-soft text-accent"
                    >
                      <Printer size={15} />Imprimer
                    </button>
                  </td>
                </tr>
                {ouvert && (
                  <tr key={`${key}-detail`} className="border-t border-line bg-surface-muted/60">
                    <td colSpan={12} className="p-0">
                      <div className="p-4 space-y-3">
                        {f.documents.map(doc => (
                          <div key={doc.id} className="rounded-lg border border-line bg-surface p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-semibold text-ink-strong flex items-center gap-2">
                                <Receipt size={14} /> {doc.date} — {doc.client}
                                {doc.companyName && <span className="text-ink-muted">({doc.companyName})</span>}
                              </p>
                              <button
                                type="button"
                                onClick={() => onPrint(doc)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 hover:bg-accent-soft text-accent"
                              >
                                <Printer size={13} />Imprimer cette pièce
                              </button>
                            </div>
                            <ul className="mt-2 space-y-1 text-ink-muted">
                              {doc.items.length
                                ? doc.items.map((item, index) => (
                                    <li key={index} className="flex justify-between gap-4">
                                      <span>{item.description}{item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ''}</span>
                                      <span className="whitespace-nowrap">{formatMoney(item.amount)}</span>
                                    </li>
                                  ))
                                : <li>Aucun acte détaillé sur cette pièce.</li>}
                            </ul>
                            <div className="mt-2 flex flex-wrap gap-4 border-t border-line pt-2 font-semibold">
                              <span>Total : {formatMoney(doc.total)}</span>
                              {doc.copay > 0 && <span>Ticket modérateur : {formatMoney(doc.copay)}</span>}
                              <span>Part à réclamer : {formatMoney(doc.payable)}</span>
                              <span className="text-emerald-700">Perçu : {formatMoney(doc.paid)}</span>
                              {doc.rejected > 0 && <span className="text-rose-700">Rejeté : {formatMoney(doc.rejected)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
        <tfoot className="bg-surface-muted text-ink-strong font-bold">
          <tr>
            <td className="p-3" colSpan={4}>Totaux ({factures.length} facture(s))</td>
            <td className="p-3 whitespace-nowrap">{formatMoney(totaux.total)}</td>
            <td className="p-3 whitespace-nowrap">{formatMoney(totaux.copay)}</td>
            <td className="p-3 whitespace-nowrap">{formatMoney(totaux.payable)}</td>
            <td className="p-3 whitespace-nowrap">{formatMoney(totaux.paid)}</td>
            <td className="p-3 whitespace-nowrap">{formatMoney(totaux.remaining)}</td>
            <td className="p-3" colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
