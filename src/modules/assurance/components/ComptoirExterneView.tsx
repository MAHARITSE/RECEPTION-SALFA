import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Receipt, FileText, Info, Search, X, Combine, FilePlus2 } from 'lucide-react';
import type { AppState } from '../../../store';
import { addAuditLog, familyManagesStock } from '../../../store';
import type { AjoutFacturier } from '../../../types';
import type { LignePrestation, Prestation } from '../types';
import { IS_WAMP_BUILD } from '../../../wamp';
import { issueMonthlyInvoiceInBrowser } from '../../../browserDb';
import { billingTotals, categoryLabels, collectBillingDocuments, documentsForScope, monthlyGroups, monthlyScopeId, preserveMonthlyInvoices, type BillingDocument, type MonthlyScope } from '../monthlyBilling';
import { auditArticleFamilies } from '../billingFamilies';
import { oldestBillingNumber, printIndividualBillingDocument, printMergedBillingDocuments, printMonthlyInvoice, printTwoPerPage } from '../printBilling';
import { PrescriptionEditModal } from './billing/PrescriptionEditModal';
import { deltaStockVentesOmises } from '../utils/stockVentesOmises';
import { documentCorrespondRecherche, factureCorrespondRecherche, nomClientGenerique, normaliserRecherche } from '../utils/rechercheDocument';
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
  const [mode, setMode] = useState<'factures' | 'detaillee'>('detaillee');
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
  // Sélection des factures du client ouvert → impression « 2 par page A4 » ou fusion.
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  // Recherche propre à la fiche client (n°, date, articles, montants), sans filtre de mois.
  const [rechercheFacture, setRechercheFacture] = useState('');
  // Fusion en attente du nom à inscrire (client sans nom propre).
  const [fusionNom, setFusionNom] = useState<BillingDocument[] | null>(null);
  // Prescription ouverte (ventes omises / ordonnances externes, comme les sociétés).
  const [prescriptionDoc, setPrescriptionDoc] = useState<BillingDocument | null>(null);
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
  // Fiche client ouverte : TOUTES ses factures, toutes dates confondues, sans
  // le filtre mois ni la recherche extérieure (« sans filtre ») — la fiche a
  // son propre champ de recherche (pré-rempli avec la recherche extérieure).
  const docsClientOuvert = useMemo(() => {
    if (!clientOuvert) return [];
    return documents
      .filter(d => (normaliserRecherche(d.client) || 'sans-nom') === clientOuvert.cle)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || a.number.localeCompare(b.number));
  }, [documents, clientOuvert]);

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
    const nom = nomFacture.trim();
    if (!nom) return;
    // Le nom saisi ne fait qu'être imprimé : la base n'est PAS modifiée
    // (les pièces gardent leur libellé générique et leurs données).
    if (fusionNom && fusionNom.length) {
      const docs = fusionNom;
      setFusionNom(null);
      printMergedBillingDocuments(state, docs, nom);
      setNotice(`Facture fusionnée n° ${oldestBillingNumber(docs)} (la plus ancienne des ${docs.length}) — A4 paysage, sans lister les factures d’origine.`);
      return;
    }
    const doc = factureNom;
    if (!doc) return;
    setFactureNom(null);
    printIndividualBillingDocument(state, { ...doc, client: nom });
  }

  /** Impression « 2 factures par page A4 » des factures cochées du client ouvert. */
  function imprimerSelectionDeuxParPage() {
    if (!clientOuvert) return;
    const docs = docsClientOuvert.filter(d => selection[d.id])
      .map(d => nomClientGenerique(d.client) ? { ...d, client: clientOuvert.nom } : d);
    if (!docs.length) { setNotice('Cochez d’abord au moins une facture à imprimer.'); return; }
    printTwoPerPage(state, docs);
    setNotice(`${docs.length} facture(s) envoyée(s) à l’impression — 2 par page A4, chacune avec son propre en-tête.`);
  }

  /** Fusion des factures cochées en UNE seule facture (A4 paysage, suite à droite). */
  function fusionnerSelection() {
    if (!clientOuvert) return;
    const docs = docsClientOuvert.filter(d => selection[d.id]);
    if (!docs.length) { setNotice('Cochez d’abord au moins une facture à fusionner.'); return; }
    if (nomClientGenerique(clientOuvert.nom)) { setNomFacture(''); setFusionNom(docs); return; }
    printMergedBillingDocuments(state, docs, clientOuvert.nom);
    setNotice(`Facture fusionnée n° ${oldestBillingNumber(docs)} (la plus ancienne des ${docs.length}) — A4 paysage, sans lister les factures d’origine.`);
  }

  /** Ajouts du facturier déjà enregistrés sur la pièce d'origine (facture ou vente). */
  const ajoutsDuDoc = (d: BillingDocument): AjoutFacturier[] =>
    state.invoices.find(i => i.id === d.sourceId)?.ajoutsFacturier
    || state.ventes.find(v => v.id === d.sourceId)?.ajoutsFacturier
    || [];

  /**
   * Adapte une pièce comptoir / externe au MODAL prescription des sociétés :
   * lignes Caisse reconstruites depuis la pièce d'origine (verrouillées 🔒)
   * + ajouts du facturier (modifiables). Rien n'est copié en base assurance.
   */
  function prestationPourDoc(d: BillingDocument): Prestation {
    const inv = state.invoices.find(i => i.id === d.sourceId);
    const lignesCaisse: LignePrestation[] = inv
      ? inv.items.map((it, index) => ({
          id: `${d.id}:caisse:${index}`, prestationId: d.id, code: it.code || '', libelle: it.description,
          totalPrestation: it.amount, totalPaye: 0, origine: 'caisse' as const, quantity: it.quantity, prixUnitaire: it.unitPrice,
        }))
      : (state.venteLines || []).filter(l => l.venteId === d.sourceId).map((l, index) => ({
          id: `${d.id}:caisse:${index}`, prestationId: d.id, code: '', libelle: l.articleName,
          totalPrestation: Math.round(l.quantity * l.unitPrice * (1 - l.discount / 100) * 100) / 100, totalPaye: 0,
          origine: 'caisse' as const, quantity: l.quantity, prixUnitaire: l.unitPrice,
        }));
    const ajouts: LignePrestation[] = ajoutsDuDoc(d).map(a => ({
      id: a.id, prestationId: d.id, code: a.code, libelle: a.libelle, totalPrestation: a.totalPrestation,
      ticketModerateur: a.ticketModerateur || 0,
      montantARembourser: Math.round((a.totalPrestation - (a.ticketModerateur || 0)) * 100) / 100,
      totalPaye: 0, origine: a.origine, articleId: a.articleId,
      quantity: a.quantity, remisePct: a.remisePct, prixUnitaire: a.prixUnitaire, dateActe: a.dateActe,
    }));
    const vente = !inv ? state.ventes.find(v => v.id === d.sourceId) : undefined;
    return {
      id: d.id, numeroFacture: d.number, date: d.date, societeId: '', societeNom: d.client,
      sousSociete: d.subCompany || '', personneId: '', statut: 'Payé',
      lignes: [...lignesCaisse, ...ajouts],
      totalPrestation: d.total, participation: d.copay, montantARembourser: d.payable,
      dateCreation: d.date, commentaires: inv?.commentaireFacturier || vente?.commentaireFacturier,
    };
  }

  /**
   * Enregistre la prescription d'une pièce comptoir / externe : SEULS les
   * ajouts (omissions / ordonnances externes) et le commentaire sont conservés
   * sur la pièce d'origine — ses lignes Caisse restent intactes. Les ventes
   * omises reliées au catalogue régularisent le stock pharmacie (comme les
   * sociétés) ; les ordonnances externes n'ont aucun impact stock.
   */
  function enregistrerPrescriptionComptoir(doc: BillingDocument, next: Prestation) {
    const ajouts: AjoutFacturier[] = next.lignes
      .filter(l => l.origine === 'omission' || l.origine === 'ordonnance_externe')
      .map(l => ({
        id: l.id, code: l.code || '', libelle: (l.libelle || '').trim(), quantity: l.quantity,
        remisePct: l.remisePct, prixUnitaire: l.prixUnitaire, totalPrestation: l.totalPrestation,
        ticketModerateur: l.ticketModerateur || 0, origine: l.origine as 'omission' | 'ordonnance_externe',
        articleId: l.articleId, dateActe: l.dateActe,
      }));
    const commentaires = (next.commentaires || '').trim() || undefined;
    const avant: LignePrestation[] = ajoutsDuDoc(doc).map(a => ({ ...a, prestationId: doc.id, totalPaye: 0 } as LignePrestation));
    const mouvements = deltaStockVentesOmises({ lignes: avant } as Prestation, { lignes: next.lignes } as Prestation);
    setState(prev => {
      const articles = [...prev.articles];
      const appliques: string[] = [];
      for (const m of mouvements) {
        const idx = articles.findIndex(a => a.id === m.articleId);
        if (idx < 0 || !familyManagesStock(articles[idx].family, prev.familles)) continue;
        articles[idx] = { ...articles[idx], stockPharmacie: Math.max(0, articles[idx].stockPharmacie - m.qte) };
        appliques.push(`${articles[idx].name} (${m.qte > 0 ? '−' : '+'}${Math.abs(m.qte)})`);
      }
      const nextState: AppState = {
        ...prev, articles,
        invoices: prev.invoices.map(i => i.id === doc.sourceId ? { ...i, ajoutsFacturier: ajouts, commentaireFacturier: commentaires } : i),
        ventes: prev.ventes.map(v => v.id === doc.sourceId ? { ...v, ajoutsFacturier: ajouts, commentaireFacturier: commentaires } : v),
      };
      if (appliques.length) {
        addAuditLog(nextState, 'ASSURANCE_VENTE_OMISE', `Stock pharmacie régularisé — ${doc.number} : ${appliques.join(', ')}`);
      }
      return nextState;
    });
    setPrescriptionDoc(null);
    setNotice(`Prescription ${doc.number} mise à jour — ${ajouts.length} ajout(s) (omissions / ordonnances externes).`);
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
            onDoubleClick={() => { setSelection({}); setRechercheFacture(recherche); setClientOuvert({ cle: g.cle, nom: g.nom }); }}>
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
        <button type="button" role="tab" aria-selected={mode === 'detaillee'} onClick={() => setMode('detaillee')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${mode === 'detaillee' ? 'bg-surface text-indigo-700 shadow-2xs' : 'text-ink-secondary hover:text-ink-strong'}`}>
          <FileText className="w-3.5 h-3.5 text-indigo-600" />
          <span>Vue Détaillée (Dossiers)</span>
          <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-indigo-100 text-indigo-800 font-bold">{groupesClients.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === 'factures'} onClick={() => setMode('factures')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${mode === 'factures' ? 'bg-surface text-indigo-700 shadow-2xs' : 'text-ink-secondary hover:text-ink-strong'}`}>
          <Receipt className="w-3.5 h-3.5 text-ink-secondary" />
          <span>Vue par Facture</span>
          <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-surface-active text-ink font-bold">{groups.length}</span>
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
      const nom = clientOuvert.nom;
      const affiches = docsClientOuvert.filter(d => factureCorrespondRecherche(d, rechercheFacture));
      const coches = docsClientOuvert.filter(d => selection[d.id]);
      const totaux = billingTotals(affiches);
      const rechercheActive = rechercheFacture.trim() !== '';
      return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200" onMouseDown={e => { if (e.target === e.currentTarget) setClientOuvert(null); }}>
          <div className="bg-surface rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col max-h-[92vh]" role="dialog" aria-label={`Factures de ${nom}`}>
            <div className="flex items-start justify-between gap-3 border-b border-line-soft px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/25 text-indigo-700 dark:text-indigo-300"><FileText className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-lg font-bold text-ink-strong">{nom}</h3>
                  <p className="text-xs text-ink-muted mt-0.5">{docsClientOuvert.length} facture(s) — toutes les dates{rechercheActive && ` — ${affiches.length} affichée(s)`}</p>
                </div>
              </div>
              <button onClick={() => setClientOuvert(null)} aria-label="Fermer" className="p-2 rounded-xl text-ink-faint hover:text-ink hover:bg-surface-hover transition cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 overflow-y-auto">
              <div className="mb-2 flex items-center gap-2">
                <span className="relative inline-block flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-ink-faint" />
                  <input aria-label="Rechercher une facture du client" type="text" value={rechercheFacture}
                    onChange={event => setRechercheFacture(event.target.value)} placeholder="Rechercher : n° facture, date, article, montant…"
                    title="Recherche sans filtre de mois : n° facture, date, article ou montant"
                    className="w-full rounded-lg border border-line bg-field py-2 pl-8 pr-8 text-xs" />
                  {rechercheFacture && <button type="button" aria-label="Effacer la recherche de facture" onClick={() => setRechercheFacture('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
                </span>
              </div>
              <p className="mb-2 text-[11px] text-ink-muted flex items-center gap-1.5"><Printer size={13} className="text-indigo-500" /> Cochez plusieurs factures puis « Imprimer la sélection — 2 par page A4 » pour économiser le papier (2 factures côte à côte par feuille A4 paysage, chacune avec son propre en-tête), ou « Fusionner » pour n'en faire qu'une seule facture portant le numéro de la plus ancienne.</p>
              <p className="mb-2 text-[11px] text-ink-muted flex items-center gap-1.5"><FilePlus2 size={13} className="text-emerald-600" /> <span><strong>Double-cliquez sur un n° facture</strong> (ou 🧾) pour ouvrir sa prescription et y saisir, comme dans les sociétés, les <strong>ventes omises</strong> (− stock pharmacie) ou les <strong>ordonnances externes</strong> remboursées par l'hôpital (sans stock).</span></p>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-left text-xs" aria-label={`Factures de ${nom}`}>
                  <thead className="bg-surface-muted text-ink-secondary"><tr>
                    <th className="p-2.5 w-10">
                      <input type="checkbox" aria-label="Tout sélectionner" title="Tout sélectionner / tout désélectionner (factures affichées)"
                        checked={affiches.length > 0 && affiches.every(d => selection[d.id])}
                        onChange={e => { const on = e.target.checked; setSelection(prev => ({ ...prev, ...Object.fromEntries(affiches.map(d => [d.id, on])) })); }}
                        className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                    </th>
                    {['Date', 'Facture', 'Catégorie', 'Montant', 'Encaissé', 'Impression'].map(label => <th className="p-2.5" key={label}>{label}</th>)}
                  </tr></thead>
                  <tbody>
                    {affiches.map(d => {
                      const nbAjouts = ajoutsDuDoc(d).length;
                      return (
                      <tr key={d.id} className="border-t border-line hover:bg-surface-hover">
                        <td className="p-2.5">
                          <input type="checkbox" aria-label={`Sélectionner la facture ${d.number}`} title="Sélectionner pour l'impression 2 par page A4 ou la fusion"
                            checked={!!selection[d.id]}
                            onChange={e => setSelection(prev => ({ ...prev, [d.id]: e.target.checked }))}
                            className="w-4 h-4 accent-indigo-600 cursor-pointer" />
                        </td>
                        <td className="p-2.5 whitespace-nowrap">{formatDate(d.date)}</td>
                        <td className="p-2.5 font-mono font-semibold cursor-pointer hover:text-indigo-700 dark:hover:text-indigo-300 underline decoration-dotted underline-offset-2"
                            title="Double-clic : ouvrir la prescription (ventes omises / ordonnances externes)"
                            onDoubleClick={() => setPrescriptionDoc(d)}>
                          {d.number}
                          {nbAjouts > 0 && <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10px] font-bold" title="Lignes ajoutées par le facturier">+{nbAjouts}</span>}
                        </td>
                        <td className="p-2.5">{categoryLabels[d.category]}</td>
                        <td className="p-2.5 whitespace-nowrap font-mono">{formatMoney(d.total)}</td>
                        <td className="p-2.5 whitespace-nowrap font-mono">{formatMoney(d.paid)}</td>
                        <td className="p-2.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button type="button" onClick={() => setPrescriptionDoc(d)} aria-label={`Prescription de la facture ${d.number}`}
                              title="Prescription : saisir les ventes omises / ordonnances externes (comme dans les sociétés)"
                              className="inline-flex items-center gap-1 rounded-lg border border-line-strong px-2 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                              <FilePlus2 size={14} />
                            </button>
                            <button type="button" onClick={() => demanderFacture(d)} aria-label={`Imprimer la facture ${d.number}`}
                              title={nomClientGenerique(d.client) ? 'Le nom du client à inscrire sur la facture vous sera demandé' : undefined}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 hover:bg-accent-soft text-accent">
                              <Printer size={14} />Imprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                    {!affiches.length && <tr><td colSpan={7} className="p-6 text-center text-ink-muted italic">{rechercheActive ? 'Aucune facture ne correspond à cette recherche.' : 'Aucune facture pour cette sélection.'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-6 py-3">
              <span className="text-sm font-bold text-ink-strong">Total{rechercheActive ? ' (affichées)' : ''} : {formatMoney(totaux.total)}</span>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-ink-muted">Encaissé : {formatMoney(totaux.paid)}</span>
                <button type="button" onClick={fusionnerSelection}
                  disabled={!coches.length}
                  title="Regroupe les factures cochées en UNE seule facture portant le numéro de la PLUS ANCIENNE, sans lister les factures d’origine (A4 paysage : la suite se poursuit sur la moitié droite de la feuille)"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-45 px-3 py-2 text-xs font-semibold text-white cursor-pointer">
                  <Combine size={14} /> Fusionner en une seule facture ({coches.length})
                </button>
                <button type="button" onClick={imprimerSelectionDeuxParPage}
                  disabled={!coches.length}
                  title="Imprime les factures cochées deux par deux sur des feuilles A4 paysage — deux en-têtes séparés, un par facture, chacun cantonné à sa moitié de feuille"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 px-3 py-2 text-xs font-semibold text-white cursor-pointer">
                  <Printer size={14} /> Imprimer la sélection — 2 par page A4 ({coches.length})
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Demande du nom lorsque la personne réclame sa facture (pièce sans nom propre) — facture seule ou fusionnée */}
    {(factureNom || (fusionNom && fusionNom.length > 0)) && (
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" onMouseDown={e => { if (e.target === e.currentTarget) { setFactureNom(null); setFusionNom(null); } }}>
        <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-indigo-100 dark:border-indigo-500/25" role="dialog" aria-label="Nom du client pour la facture">
          <div className="px-6 py-4 bg-indigo-50 dark:bg-indigo-500/10 border-b border-indigo-100 dark:border-indigo-500/25 flex items-center gap-2.5">
            <Receipt className="w-5 h-5 text-indigo-700 dark:text-indigo-300" />
            <div>
              <h3 className="text-base font-bold text-indigo-900 dark:text-indigo-200">Nom sur la facture</h3>
              <p className="text-xs text-indigo-700 dark:text-indigo-300 font-medium">{fusionNom && fusionNom.length
                ? `Fusion de ${fusionNom.length} facture(s) — ${formatMoney(fusionNom.reduce((s, d) => s + d.total, 0))}`
                : factureNom && `${factureNom.number} — ${formatMoney(factureNom.total)}`}</p>
            </div>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-sm text-ink-secondary">La personne réclame sa facture{fusionNom && fusionNom.length ? ' fusionnée' : ''} : saisissez le nom à imprimer dessus. Ce nom n'est pas enregistré dans la base — les données des pièces restent inchangées.</p>
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
            <button type="button" onClick={() => { setFactureNom(null); setFusionNom(null); }} className="px-4 py-2 rounded-xl text-xs font-semibold border border-line hover:bg-surface-hover transition cursor-pointer">Annuler</button>
            <button type="button" disabled={!nomFacture.trim()} onClick={confirmerNomFacture}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              <Printer className="w-4 h-4" /> Imprimer la facture
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ===== MODAL : prescription de la pièce (ventes omises / ordonnances externes, comme les sociétés) ===== */}
    {prescriptionDoc && (
      <PrescriptionEditModal
        prestation={prestationPourDoc(prescriptionDoc)}
        familles={state.assuranceFamilles || []}
        articles={state.articles}
        tarif={prescriptionDoc.category === 'externe' ? 'externe' : 'comptoir'}
        onClose={() => setPrescriptionDoc(null)}
        onSave={next => enregistrerPrescriptionComptoir(prescriptionDoc, next)}
      />
    )}
  </section>;
}
