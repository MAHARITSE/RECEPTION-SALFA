import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Receipt, FileText, Info, Search, X } from 'lucide-react';
import type { AppState } from '../../../store';
import { IS_WAMP_BUILD } from '../../../wamp';
import { issueMonthlyInvoiceInBrowser } from '../../../browserDb';
import { billingTotals, categoryLabels, collectBillingDocuments, documentsForScope, monthlyGroups, monthlyScopeId, preserveMonthlyInvoices, type BillingDocument, type MonthlyScope } from '../monthlyBilling';
import { auditArticleFamilies } from '../billingFamilies';
import { printIndividualBillingDocument, printMonthlyInvoice } from '../printBilling';
import { documentCorrespondRecherche, nomClientGenerique, normaliserRecherche } from '../utils/rechercheDocument';
import { formatDate } from '../utils/formatters';

type Props = { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> };

/**
 * Onglet « Comptoir & Externe » : regroupe les clients comptoir et externes,
 * retirés de la Facturation (sociétés) et des Règlements. Leur règlement est
 * encaissé au moment de la validation à la Caisse : aucun suivi n'est nécessaire
 * ici, l'onglet sert à l'archivage et à l'édition des factures mensuelles.
 */
export function ComptoirExterneView({ state, setState }: Props) {
  const formatMoney = (value: number, currency = state.ticketSettings.currency) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  const [mode, setMode] = useState<'factures' | 'detaillee'>('factures');
  const [month, setMonth] = useState('');
  // Recherche par nom de client ou numéro de facture (insensible à la casse et aux accents).
  const [recherche, setRecherche] = useState('');
  // Demande de facture par la personne : si la pièce n'a pas de nom propre
  // (« Client Externe »…), le nom à inscrire est demandé avant l'impression.
  const [factureNom, setFactureNom] = useState<BillingDocument | null>(null);
  const [nomFacture, setNomFacture] = useState('');
  // Vue Détaillée : un dossier par nom de client ; le double-clic ouvre
  // la liste complète de ses factures (dates + impression).
  const [clientOuvert, setClientOuvert] = useState<{ cle: string; nom: string } | null>(null);
  const articleIssues = useMemo(() => auditArticleFamilies(state), [state]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const printing = useRef(false);
  // Clients comptoir & externes uniquement : les sociétés restent dans Facturation.
  const documents = useMemo(() => collectBillingDocuments(state).filter(d => d.category !== 'societe'), [state]);
  const snapshots = state.monthlyInvoices || [];
  const visible = documents.filter(d => (!month || d.date.slice(0, 7) === month) && documentCorrespondRecherche(d, recherche));
  const groups = monthlyGroups(visible);
  // Dossiers : une ligne par nom de client (noms regroupés sans casse ni accents),
  // factures triées de la plus récente à la plus ancienne.
  const groupesClients = useMemo(() => {
    const map = new Map<string, { cle: string; nom: string; docs: BillingDocument[] }>();
    for (const d of visible) {
      const cle = normaliserRecherche(d.client) || 'sans-nom';
      const groupe = map.get(cle);
      if (groupe) groupe.docs.push(d);
      else map.set(cle, { cle, nom: d.client || 'Client sans nom', docs: [d] });
    }
    return [...map.values()]
      .map(g => ({ ...g, docs: g.docs.slice().sort((a, b) => b.date.localeCompare(a.date) || a.number.localeCompare(b.number)) }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [visible]);

  useEffect(() => { setError(''); setNotice(''); }, [month]);

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
      setNotice(`Facture mensuelle ${invoice.number} enregistrée — les impressions suivantes réutilisent ce numéro.`);
      printMonthlyInvoice(invoice, state.ticketSettings);
    } catch (cause) {
      setError(`Impression mensuelle non lancée : ${(cause as Error).message}`);
    } finally { printing.current = false; setBusy(null); }
  }

  function demanderFacture(doc: BillingDocument) {
    if (!nomClientGenerique(doc.client)) { printIndividualBillingDocument(state, doc); return; }
    setNomFacture('');
    setFactureNom(doc);
  }

  function confirmerNomFacture() {
    const doc = factureNom;
    const nom = nomFacture.trim();
    if (!doc || !nom) return;
    // Le nom saisi ne fait qu'être imprimé sur la facture : la base n'est
    // PAS modifiée (la pièce garde son libellé générique et ses données).
    setFactureNom(null);
    printIndividualBillingDocument(state, { ...doc, client: nom });
  }

  function renderDossiersTable() {
    return <div className="overflow-x-auto rounded-xl border border-line bg-surface" data-testid="comptoir-dossiers-table">
      <table className="w-full text-left text-xs" aria-label="Dossiers clients comptoir & externes">
        <thead className="bg-surface-muted text-ink-secondary"><tr>{['Client / Dossier', 'Factures', 'Période', 'Total', 'Encaissé'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{groupesClients.map(g => {
          const totaux = billingTotals(g.docs);
          const dates = g.docs.map(d => d.date).sort();
          const periode = dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} → ${dates[dates.length - 1]}`;
          const premiere = g.docs[0];
          return <tr key={g.cle} className="border-t border-line cursor-pointer hover:bg-surface-hover"
            title="Double-clic : voir toutes les factures de ce client"
            onDoubleClick={() => setClientOuvert({ cle: g.cle, nom: g.nom })}>
            <td className="p-3 font-semibold text-indigo-700 dark:text-indigo-300 underline decoration-dotted underline-offset-2">
              {g.nom}
              {premiere.dossier && <span className="block text-ink-muted font-normal">{premiere.dossier}</span>}
              {nomClientGenerique(g.nom) && <span className="block text-[10px] text-amber-700 font-normal">Nom à demander à l'impression</span>}
            </td>
            <td className="p-3 text-center font-bold">{g.docs.length}</td>
            <td className="p-3 whitespace-nowrap">{periode}</td>
            <td className="p-3 whitespace-nowrap">{formatMoney(totaux.total)}</td>
            <td className="p-3 whitespace-nowrap">{formatMoney(totaux.paid)}</td>
          </tr>;
        })}</tbody>
      </table>
      {!groupesClients.length && <p className="p-6 text-center text-sm text-ink-muted">Aucune facture pour cette sélection.</p>}
    </div>;
  }

  return <section className="space-y-4" aria-label="Facturation comptoir & externes">
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex p-1 bg-surface-hover rounded-xl border border-line text-xs" role="tablist" aria-label="Vues comptoir & externes">
        <button type="button" role="tab" aria-selected={mode === 'factures'} onClick={() => setMode('factures')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${mode === 'factures' ? 'bg-surface text-indigo-700 shadow-2xs' : 'text-ink-secondary hover:text-ink-strong'}`}>
          <Receipt className="w-3.5 h-3.5 text-indigo-600" />
          <span>Vue par Facture</span>
          <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-indigo-100 text-indigo-800 font-bold">{groups.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === 'detaillee'} onClick={() => setMode('detaillee')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${mode === 'detaillee' ? 'bg-surface text-indigo-700 shadow-2xs' : 'text-ink-secondary hover:text-ink-strong'}`}>
          <FileText className="w-3.5 h-3.5 text-ink-secondary" />
          <span>Vue Détaillée (Dossiers)</span>
          <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-surface-active text-ink font-bold">{groupesClients.length}</span>
        </button>
      </div>
      <label className="text-sm text-ink">Mois <input aria-label="Mois comptoir & externe" type="month" value={month} onChange={event => setMonth(event.target.value)} className="ml-2 rounded-lg border border-line bg-field p-2" /></label>
      {month && <button type="button" className="text-xs text-accent underline" onClick={() => setMonth('')}>Tous les mois</button>}
      <label className="text-sm text-ink">Recherche
        <span className="relative inline-block ml-2 align-middle">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-ink-faint" />
          <input aria-label="Rechercher un nom ou un numéro de facture" type="text" value={recherche}
            onChange={event => setRecherche(event.target.value)} placeholder="Nom client ou n° facture…"
            title="Recherche par nom de client, numéro de facture, dossier ou matricule"
            className="w-56 rounded-lg border border-line bg-field py-2 pl-8 pr-8" />
          {recherche && <button type="button" aria-label="Effacer la recherche" onClick={() => setRecherche('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
        </span>
      </label>
    </div>
    <p className="flex items-start gap-2 rounded-xl border border-line bg-surface-muted p-3 text-sm text-ink-secondary">
      <Info className="w-4 h-4 shrink-0 mt-0.5 text-accent" />
      <span>Clients <strong>comptoir</strong> et <strong>externes</strong> regroupés ici : leur règlement est encaissé au moment de la validation à la Caisse — aucun suivi de règlement n'est nécessaire. Cet onglet sert à l'archivage et à l'édition des factures mensuelles.</span>
    </p>
    {articleIssues.length > 0 && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      {articleIssues.length} article(s) ne peuvent pas être rattachés automatiquement à une famille valide. Aucun classement arbitraire n’a été appliqué.
      <ul className="max-h-48 overflow-auto">{articleIssues.map(a => <li key={a.id}>{a.name} ({a.id}) — {a.reason}{a.family ? ` : ${a.family}` : ''}</li>)}</ul>
    </div>}
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-accent-line bg-accent-soft p-3 text-sm text-ink">{notice}</p>}
    {mode === 'factures' ? <div data-testid="comptoir-invoices-view" className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface"><table className="w-full text-left text-xs" aria-label="Factures mensuelles comptoir & externes">
        <thead className="bg-surface-muted text-ink-secondary"><tr>{['Date', 'Facture', 'Client / Dossier', 'Détail des actes', 'Montant', 'Encaissé', 'Impression'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{groups.map(scope => {
          const id = monthlyScopeId(scope), saved = snapshots.find(i => i.id === id);
          const rows = documentsForScope(documents, scope).filter(d => documentCorrespondRecherche(d, recherche));
          const totaux = saved ?? billingTotals(rows);
          const missing = saved?.documents.reduce((sum, d) => sum + d.items.filter(i => !i.actCode?.trim()).length, 0) || 0;
          const recipient = saved?.recipient || `Clients ${categoryLabels[scope.category]}`;
          const nbActes = saved?.documents.reduce((sum, d) => sum + d.items.length, 0) ?? rows.reduce((sum, d) => sum + d.items.length, 0);
          const echeance = rows.length ? rows.map(r => r.date).sort()[rows.length - 1] : scope.month;
          const detailActes = (saved?.documents ?? rows).flatMap(d => d.items.map(i => ({ ...i, client: d.client })));
          return <tr key={id} className="border-t border-line hover:bg-surface-hover" data-monthly-scope={id}>
            <td className="p-3 whitespace-nowrap">{saved?.issuedAt ? formatDate(saved.issuedAt) : echeance}<span className="block text-ink-muted">{scope.month}</span></td>
            <td className="p-3 font-mono font-semibold">{saved?.number || '— attribué à la première impression —'}</td>
            <td className="p-3">{recipient}<span className="block text-ink-muted">{categoryLabels[scope.category]} · {saved?.documents.length ?? rows.length} pièce(s) · {nbActes} acte(s)</span></td>
            <td className="p-3"><details><summary className="cursor-pointer">{nbActes} acte(s)</summary><ul className="mt-2 space-y-1 max-h-48 overflow-auto">{detailActes.slice(0, 40).map((item, index) => <li key={index}>{item.client && item.client !== recipient ? <span className="text-ink-muted">{item.client} — </span> : null}{item.description} — {formatMoney(item.amount)}</li>)}{detailActes.length > 40 && <li className="text-ink-muted italic">… {detailActes.length - 40} autre(s)</li>}</ul></details></td>
            <td className="p-3 whitespace-nowrap">{formatMoney(totaux.total)}{missing > 0 && <span className="block text-[11px] text-amber-700">{missing} famille(s) sans rattachement certain</span>}</td>
            <td className="p-3 whitespace-nowrap">{formatMoney(totaux.paid ?? 0)}</td>
            <td className="p-3"><button type="button" disabled={!!busy || (IS_WAMP_BUILD && !saved)} onClick={() => void printMonthly(scope)} aria-label={`${saved ? 'Réimprimer' : 'Imprimer'} la facture mensuelle ${scope.month} ${recipient}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 hover:bg-accent-soft text-accent disabled:opacity-50"><Printer size={15} />{busy === id ? 'Enregistrement…' : saved ? 'Réimprimer' : 'Imprimer'}</button>{IS_WAMP_BUILD && missing > 0 && <p className="mt-1 text-[11px]">Réparation à effectuer côté serveur MySQL.</p>}</td>
          </tr>;
        })}</tbody>
      </table>{!groups.length && <p className="p-6 text-center text-sm text-ink-muted">Aucune facture pour cette sélection.</p>}</div>
    </div> : <div data-testid="comptoir-detail-view">
      {renderDossiersTable()}
      <p className="text-xs text-ink-muted">Double-cliquez sur le nom d'un client pour ouvrir la liste complète de ses factures et les imprimer.</p>
    </div>}

    {/* ===== MODAL : liste complète des factures d'un client (double-clic sur son nom) ===== */}
    {clientOuvert && (() => {
      const groupe = groupesClients.find(g => g.cle === clientOuvert.cle);
      if (!groupe) return null;
      const totaux = billingTotals(groupe.docs);
      return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" onMouseDown={e => { if (e.target === e.currentTarget) setClientOuvert(null); }}>
          <div className="bg-surface rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[92vh]" role="dialog" aria-label={`Factures de ${groupe.nom}`}>
            <div className="flex items-start justify-between gap-3 border-b border-line-soft px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/25 text-indigo-700 dark:text-indigo-300"><FileText className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-lg font-bold text-ink-strong">{groupe.nom}</h3>
                  <p className="text-xs text-ink-muted mt-0.5">{groupe.docs.length} facture(s) — toutes les dates</p>
                </div>
              </div>
              <button onClick={() => setClientOuvert(null)} aria-label="Fermer" className="p-2 rounded-xl text-ink-faint hover:text-ink hover:bg-surface-hover transition cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 overflow-y-auto">
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-left text-xs" aria-label={`Factures de ${groupe.nom}`}>
                  <thead className="bg-surface-muted text-ink-secondary"><tr>{['Date', 'Facture', 'Catégorie', 'Montant', 'Encaissé', 'Impression'].map(label => <th className="p-2.5" key={label}>{label}</th>)}</tr></thead>
                  <tbody>
                    {groupe.docs.map(d => (
                      <tr key={d.id} className="border-t border-line hover:bg-surface-hover">
                        <td className="p-2.5 whitespace-nowrap">{formatDate(d.date)}</td>
                        <td className="p-2.5 font-mono font-semibold">{d.number}</td>
                        <td className="p-2.5">{categoryLabels[d.category]}</td>
                        <td className="p-2.5 whitespace-nowrap font-mono">{formatMoney(d.total)}</td>
                        <td className="p-2.5 whitespace-nowrap font-mono">{formatMoney(d.paid)}</td>
                        <td className="p-2.5">
                          <button type="button" onClick={() => demanderFacture(d)} aria-label={`Imprimer la facture ${d.number}`}
                            title={nomClientGenerique(d.client) ? 'Le nom du client à inscrire sur la facture vous sera demandé' : undefined}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 hover:bg-accent-soft text-accent">
                            <Printer size={14} />Imprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!groupe.docs.length && <tr><td colSpan={6} className="p-6 text-center text-ink-muted italic">Aucune facture pour cette sélection.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-line-soft px-6 py-3">
              <span className="text-sm font-bold text-ink-strong">Total : {formatMoney(totaux.total)}</span>
              <span className="text-xs text-ink-muted">Encaissé : {formatMoney(totaux.paid)}</span>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Demande du nom lorsque la personne réclame sa facture (pièce sans nom propre) */}
    {factureNom && (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onMouseDown={e => { if (e.target === e.currentTarget) setFactureNom(null); }}>
        <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-indigo-100 dark:border-indigo-500/25" role="dialog" aria-label="Nom du client pour la facture">
          <div className="px-6 py-4 bg-indigo-50 dark:bg-indigo-500/10 border-b border-indigo-100 dark:border-indigo-500/25 flex items-center gap-2.5">
            <Receipt className="w-5 h-5 text-indigo-700 dark:text-indigo-300" />
            <div>
              <h3 className="text-base font-bold text-indigo-900 dark:text-indigo-200">Nom sur la facture</h3>
              <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">{factureNom.number} — {formatMoney(factureNom.total)}</p>
            </div>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-sm text-ink-secondary">La personne réclame sa facture : saisissez le nom à imprimer dessus. Ce nom n'est pas enregistré dans la base — les données de la pièce restent inchangées.</p>
            <input
              autoFocus
              type="text"
              value={nomFacture}
              onChange={e => setNomFacture(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmerNomFacture(); } }}
              aria-label="Nom à mettre sur la facture"
              placeholder="Ex : RAKOTO Jeanne / Société X"
              className="w-full rounded-xl border border-line bg-field p-3 text-sm outline-none focus:border-accent"
            />
            {!nomFacture.trim() && <p className="text-xs text-ink-muted">Le nom est obligatoire pour imprimer la facture.</p>}
          </div>
          <div className="px-6 py-4 border-t border-line-soft flex justify-end gap-3">
            <button type="button" onClick={() => setFactureNom(null)} className="px-4 py-2 rounded-xl text-xs font-semibold border border-line hover:bg-surface-hover transition cursor-pointer">Annuler</button>
            <button type="button" disabled={!nomFacture.trim()} onClick={confirmerNomFacture}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <Printer className="w-4 h-4" /> Imprimer la facture
            </button>
          </div>
        </div>
      </div>
    )}
  </section>;
}
