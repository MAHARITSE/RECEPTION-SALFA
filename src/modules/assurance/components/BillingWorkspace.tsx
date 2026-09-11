import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Receipt, FileText, X, PencilLine } from 'lucide-react';
import type { Prestation } from '../types';
import type { AppState } from '../../../store';
import type { ClientType } from '../../../types';
import { IS_WAMP_BUILD } from '../../../wamp';
import { issueMonthlyInvoiceInBrowser } from '../../../browserDb';
import { PrestationsView, type PrestationsViewProps } from './PrestationsView';
import { billingTotals, categoryLabels, collectBillingDocuments, documentsForScope, monthlyGroups, monthlyScopeId, preserveMonthlyInvoices, type BillingDocument, type MonthlyScope } from '../monthlyBilling';
import { auditArticleFamilies } from '../billingFamilies';
import { printIndividualBillingDocument, printMonthlyInvoice } from '../printBilling';
import { PrescriptionEditModal } from './billing/PrescriptionEditModal';
import { formatDate } from '../utils/formatters';

type Props = PrestationsViewProps & { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> };

export function BillingWorkspace({ state, setState, ...details }: Props) {
  const formatMoney = (value: number, currency = state.ticketSettings.currency) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  const [mode, setMode] = useState<'factures' | 'detaillee'>('factures');
  const [month, setMonth] = useState('');
  const articleIssues = useMemo(() => auditArticleFamilies(state), [state]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const printing = useRef(false);
  // Double-clic « Factures mensuelles » → vue détaillée du destinataire (modal)
  const [societeDetail, setSocieteDetail] = useState<MonthlyScope | null>(null);
  // Double-clic sur le nom → édition de la prescription (omissions / ordonnances externes)
  const [prescription, setPrescription] = useState<Prestation | null>(null);
  const documents = useMemo(() => collectBillingDocuments(state), [state]);
  const snapshots = state.monthlyInvoices || [];
  const matches = (scope: { category: ClientType; companyId?: string; month?: string }) => (!month || scope.month === month) && (details.selectedSocieteId === 'ALL' || (scope.category === 'societe' && scope.companyId === details.selectedSocieteId));
  const visible = documents.filter(d => {
    if (!matches({ ...d, month: d.date.slice(0, 7) })) return false;
    if (d.category !== 'societe' || !details.selectedSubSocieteId || details.selectedSubSocieteId === 'ALL') return true;
    const prestation = details.prestations.find(p => p.id === d.id);
    const subCompany = prestation?.sousSociete || state.ventes.find(v => v.id === d.sourceId)?.subCompany;
    return subCompany === details.selectedSubSocieteId;
  });
  const scopes = new Map(monthlyGroups(documents).map(scope => [monthlyScopeId(scope), scope]));
  snapshots.forEach(snapshot => scopes.set(snapshot.id, snapshot));
  const groups = [...scopes.values()].filter(matches).sort((a, b) => b.month.localeCompare(a.month) || monthlyScopeId(a).localeCompare(monthlyScopeId(b)));
  const visibleIds = new Set(visible.map(d => d.id));
  const visiblePrestations = details.prestations.filter(p => visibleIds.has(p.id));
  const otherDocuments = visible.filter(d => !details.prestations.some(p => p.id === d.id));

  useEffect(() => {
    if (details.isCreateModalOpen) setMode('detaillee');
  }, [details.isCreateModalOpen]);

  useEffect(() => { setError(''); setNotice(''); }, [details.selectedSocieteId, month]);

  async function printMonthly(scope: MonthlyScope) {
    if (printing.current) return;
    printing.current = true;
    const id = monthlyScopeId(scope);
    setBusy(id); setError(''); setNotice('');
    try {
      const saved = snapshots.find(i => i.id === id);
      if (IS_WAMP_BUILD && !saved) throw new Error('L’émission mensuelle MySQL nécessite une opération atomique dans l’API Réception. Elle n’est pas disponible sur ce serveur.');
      const invoice = IS_WAMP_BUILD ? saved! : await issueMonthlyInvoiceInBrowser(state, scope);
      setState(prev => ({ ...prev, monthlyInvoices: preserveMonthlyInvoices([invoice], prev.monthlyInvoices) }));
      printMonthlyInvoice(invoice, state.ticketSettings);
      setNotice(`${invoice.number} — document enregistré, envoyé à la file d’impression. Une annulation de l’impression ne change pas son numéro.`);
    } catch (cause) {
      setError(`Impression mensuelle non lancée : ${(cause as Error).message}`);
    } finally { printing.current = false; setBusy(null); }
  }

  const prestationDe = (docId: string) => details.prestations.find(p => p.id === docId);
  const ajoutsDe = (p: Prestation) => (p.lignes || []).filter(l => l.origine === 'omission' || l.origine === 'ordonnance_externe').length;

  function enregistrerPrescription(next: Prestation) {
    try {
      details.onSavePrestation(next);
      setPrescription(null);
      setNotice(`Prescription ${next.numeroFacture} mise à jour — omissions / ordonnances externes enregistrées.`);
    } catch (cause) {
      setError(`Enregistrement refusé : ${(cause as Error).message}`);
    }
  }

  function renderDetailTable(rows: BillingDocument[]) {
    return <div className="overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full text-left text-xs" aria-label="Factures détaillées clients">
        <thead className="bg-surface-muted text-ink-secondary"><tr>{['Date', 'Facture', 'Client / Dossier', 'Détail des actes', 'Montant', 'Payé', 'Solde', 'Impression'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{rows.map(d => <tr key={d.id} className="border-t border-line hover:bg-surface-hover">
          <td className="p-3 whitespace-nowrap">{d.date}</td><td className="p-3 font-mono font-semibold">{d.number}</td>
          <td className="p-3">{d.client}{d.dossier && <span className="block text-ink-muted">{d.dossier}</span>}</td>
          <td className="p-3"><details><summary className="cursor-pointer">{d.items.length} acte(s)</summary><ul className="mt-2 space-y-1">{d.items.map((item, index) => <li key={index}>{item.description} — {formatMoney(item.amount)}</li>)}</ul></details></td>
          <td className="p-3 whitespace-nowrap">{formatMoney(d.total)}</td><td className="p-3 whitespace-nowrap">{formatMoney(d.paid)}</td><td className="p-3 whitespace-nowrap">{formatMoney(Math.max(0, d.payable - d.paid - d.rejected))}</td>
          <td className="p-3"><button type="button" onClick={() => printIndividualBillingDocument(state, d)} aria-label={`Imprimer la facture ${d.number}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 hover:bg-accent-soft text-accent"><Printer size={15} />Imprimer</button></td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <p className="p-6 text-center text-sm text-ink-muted">Aucune facture pour cette sélection.</p>}
    </div>;
  }

  return <section className="space-y-4" aria-label="Facturation clients">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <label className="text-sm text-ink">Mois <input aria-label="Mois de facturation" type="month" value={month} onChange={event => setMonth(event.target.value)} className="ml-2 rounded-lg border border-line bg-field p-2" /></label>
      {month && <button type="button" className="text-xs text-accent underline" onClick={() => setMonth('')}>Tous les mois</button>}
    </div>
    {articleIssues.length > 0 && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      {articleIssues.length} article(s) ne peuvent pas être rattachés automatiquement à une famille valide. Aucun classement arbitraire n’a été appliqué.
      <ul className="max-h-48 overflow-auto">{articleIssues.map(a => <li key={a.id}>{a.name} ({a.id}) — {a.reason}{a.family ? ` : ${a.family}` : ''}</li>)}</ul>
    </div>}
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Vues de facturation">
      <button role="tab" aria-selected={mode === 'factures'} onClick={() => setMode('factures')} className={`flex items-center gap-2 rounded-lg px-4 py-2 border ${mode === 'factures' ? 'border-accent-line bg-accent-soft text-accent' : 'border-line text-ink-muted'}`}><Receipt size={17} />Vue par Facture <strong>{groups.length}</strong></button>
      <button role="tab" aria-selected={mode === 'detaillee'} onClick={() => setMode('detaillee')} className={`flex items-center gap-2 rounded-lg px-4 py-2 border ${mode === 'detaillee' ? 'border-accent-line bg-accent-soft text-accent' : 'border-line text-ink-muted'}`}><FileText size={17} />Vue Détaillée (Dossiers) <strong>{visible.length}</strong></button>
    </div>
    <p className="text-xs text-ink-muted">La sélection Société / Garant du haut s’applique aux deux vues et à leurs compteurs. Réinitialiser rétablit la vue globale, incluant les factures Comptoir et Externes.</p>
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-accent-line bg-accent-soft p-3 text-sm text-ink">{notice}</p>}
    {mode === 'factures' ? <div data-testid="monthly-invoices-view" className="space-y-3">
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="font-bold text-ink-strong">Factures mensuelles</h2>
        <p className="mt-1 text-xs text-ink-muted">Une facture par mois pour tous les clients Comptoir, une pour tous les Externes, et une par société (toutes sous-entités comprises). Le premier clic sur Imprimer fige le contenu et attribue un numéro FM-AAAA-MM-0001. Les réimpressions ne reprennent pas les opérations ajoutées ensuite.</p>
        {IS_WAMP_BUILD && <p className="mt-2 text-xs text-amber-700">Sur MySQL, les émissions nécessitent une API atomique à déployer. Les factures déjà enregistrées peuvent être réimprimées.</p>}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface"><table className="w-full text-left text-xs" aria-label="Factures mensuelles">
        <thead className="bg-surface-muted text-ink-secondary"><tr>{['Mois', 'Destinataire', 'Pièces', 'Montant', 'Numéro mensuel', 'Impression'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{groups.map(scope => {
          const id = monthlyScopeId(scope), saved = snapshots.find(i => i.id === id);
          const rows = documentsForScope(documents, scope);
          const missing = saved?.documents.reduce((sum, d) => sum + d.items.filter(i => !i.actCode?.trim()).length, 0) || 0;
          const recipient = saved?.recipient || (scope.category === 'societe' ? state.companies.find(c => c.id === scope.companyId)?.name || rows[0]?.companyName || 'Société' : `Clients ${categoryLabels[scope.category]}`);
          return <tr key={id} className="border-t border-line cursor-pointer hover:bg-surface-hover" data-monthly-scope={id} title="Double-clic : vue détaillée de ce destinataire" onDoubleClick={() => setSocieteDetail(scope)}>
            <td className="p-3 whitespace-nowrap font-semibold">{scope.month}</td><td className="p-3">{recipient}</td>
            <td className="p-3">{saved?.documents.length ?? rows.length}{saved && <span className="block text-ink-muted">Contenu figé</span>}</td>
            <td className="p-3 whitespace-nowrap">{formatMoney(saved?.total ?? billingTotals(rows).total)}</td>
            <td className="p-3 font-mono">{saved?.number || 'Attribué à la première impression'}{missing > 0 && <div className="mt-2 text-xs text-amber-700 font-sans">{missing} famille(s) encore sans rattachement certain. Les correspondances identifiées sont réorganisées automatiquement en base navigateur.</div>}</td>
            <td className="p-3"><button type="button" disabled={!!busy || (IS_WAMP_BUILD && !saved)} onClick={() => void printMonthly(scope)} aria-label={`${saved ? 'Réimprimer' : 'Imprimer'} la facture mensuelle ${scope.month} ${recipient}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-accent hover:bg-accent-soft disabled:opacity-50"><Printer size={15} />{busy === id ? 'Enregistrement…' : saved ? 'Réimprimer' : 'Imprimer'}</button>{IS_WAMP_BUILD && missing > 0 && <p className="mt-1 text-xs">Réparation à effectuer côté serveur MySQL.</p>}</td>
          </tr>;
        })}</tbody>
      </table>{!groups.length && <p className="p-6 text-center text-sm text-ink-muted">Aucune facture pour cette sélection.</p>}</div>
    </div> : <div data-testid="billing-detail-view">
      <>
        <PrestationsView {...details} prestations={visiblePrestations} hideViewSwitcher onPrintPrestation={p => { const doc = documents.find(d => d.id === p.id); if (doc) printIndividualBillingDocument(state, doc); }} />
        {otherDocuments.length > 0 && <div className="mt-4"><h3 className="mb-2 font-semibold">Autres factures de la base commune</h3>{renderDetailTable(otherDocuments)}</div>}
      </>
    </div>}

    {/* ===== MODAL : vue détaillée du destinataire de la facture mensuelle ===== */}
    {societeDetail && (() => {
      const saved = snapshots.find(i => i.id === monthlyScopeId(societeDetail));
      const lignes = saved?.documents ?? documentsForScope(documents, societeDetail);
      const destinataire = saved?.recipient || (societeDetail.category === 'societe' ? state.companies.find(c => c.id === societeDetail.companyId)?.name || 'Société' : `Clients ${categoryLabels[societeDetail.category]}`);
      const total = saved?.total ?? billingTotals(lignes).total;
      return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" onMouseDown={e => { if (e.target === e.currentTarget) setSocieteDetail(null); }}>
          <div className="bg-surface rounded-2xl max-w-5xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto" role="dialog" aria-label={`Vue détaillée ${destinataire} ${societeDetail.month}`}>
            <div className="flex items-start justify-between gap-3 border-b border-line-soft pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/25 text-indigo-700 dark:text-indigo-300"><Receipt className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-lg font-bold text-ink-strong">{destinataire} — {societeDetail.month}</h3>
                  <p className="text-xs text-ink-muted mt-0.5">{saved ? `Facture mensuelle ${saved.number || 'enregistrée'} — contenu figé à l'impression.` : 'Facture mensuelle pas encore imprimée — contenu en cours.'}</p>
                </div>
              </div>
              <button onClick={() => setSocieteDetail(null)} aria-label="Fermer" className="p-2 rounded-xl text-ink-faint hover:text-ink hover:bg-surface-hover transition cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-ink-muted"><strong>Double-cliquez sur le nom</strong> d'un assuré pour ouvrir sa prescription et y saisir les omissions ou les ordonnances externes remboursées par l'hôpital.</p>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-xs" aria-label={`Prescriptions de ${destinataire}`}>
                <thead className="bg-surface-muted text-ink-secondary"><tr>{['Date', 'Facture', 'Assuré / Client', 'Sous-soc.', 'Actes', 'Brut', 'À rembourser', 'Payé', 'Solde', 'Statut'].map(label => <th className="p-2.5" key={label}>{label}</th>)}</tr></thead>
                <tbody>
                  {lignes.map(d => {
                    const p = prestationDe(d.id);
                    const nbAjouts = p ? ajoutsDe(p) : 0;
                    const solde = Math.max(0, d.payable - d.paid - d.rejected);
                    return (
                      <tr key={d.id} className="border-t border-line hover:bg-surface-hover">
                        <td className="p-2.5 whitespace-nowrap">{formatDate(d.date)}</td>
                        <td className="p-2.5 font-mono font-semibold">{d.number}</td>
                        <td className={`p-2.5 ${p ? 'cursor-pointer font-semibold text-indigo-700 dark:text-indigo-300 underline decoration-dotted underline-offset-2' : ''}`}
                            title={p ? 'Double-clic : ouvrir la prescription' : undefined}
                            onDoubleClick={() => { if (p) setPrescription(p) }}>
                          {d.client}{d.dossier && <span className="block text-ink-muted font-normal">{d.dossier}</span>}
                          {nbAjouts > 0 && <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-bold" title="Lignes ajoutées par le facturier">+{nbAjouts}</span>}
                        </td>
                        <td className="p-2.5">{d.subCompany || '—'}</td>
                        <td className="p-2.5">{d.items.length} acte(s)</td>
                        <td className="p-2.5 whitespace-nowrap font-mono">{formatMoney(d.total)}</td>
                        <td className="p-2.5 whitespace-nowrap font-mono">{formatMoney(d.payable)}</td>
                        <td className="p-2.5 whitespace-nowrap font-mono">{formatMoney(d.paid)}</td>
                        <td className="p-2.5 whitespace-nowrap font-mono">{formatMoney(solde)}</td>
                        <td className="p-2.5">{p?.statut || '—'}</td>
                      </tr>
                    );
                  })}
                  {!lignes.length && <tr><td colSpan={10} className="p-6 text-center text-ink-muted italic">Aucune prescription pour cette sélection.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-line-soft pt-3">
              <span className="text-sm font-bold text-ink-strong">Total : {formatMoney(total)}</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted"><PencilLine className="w-3.5 h-3.5" /> Les ajouts du facturier n'altèrent jamais la facture Caisse d'origine.</span>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ===== MODAL : édition de la prescription (omissions / ordonnances externes) ===== */}
    {prescription && (
      <PrescriptionEditModal
        prestation={prescription}
        familles={details.familles}
        articles={state.articles}
        onClose={() => setPrescription(null)}
        onSave={enregistrerPrescription}
      />
    )}
  </section>;
}
