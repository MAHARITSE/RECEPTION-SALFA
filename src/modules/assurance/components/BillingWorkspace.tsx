import { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, Receipt, FileText, X, PencilLine, Banknote, Merge, ClipboardEdit, Trash2, AlertTriangle } from 'lucide-react';
import type { Prestation } from '../types';
import type { AppState } from '../../../store';
import type { ClientType } from '../../../types';
import { IS_WAMP_BUILD } from '../../../wamp';
import { issueMonthlyInvoiceInBrowser } from '../../../browserDb';
import { PrestationsView, type PrestationsViewProps } from './PrestationsView';
import { billingTotals, categoryLabels, collectBillingDocuments, documentsForScope, monthlyGroups, monthlyScopeId, preserveMonthlyInvoices, type MonthlyScope } from '../monthlyBilling';
import { auditArticleFamilies } from '../billingFamilies';
import { printIndividualBillingDocument, printMonthlyInvoice } from '../printBilling';
import { PrescriptionEditModal } from './billing/PrescriptionEditModal';
import { FusionPrescriptionModal } from './billing/FusionPrescriptionModal';
import { PaiementGlobalModal } from './billing/PaiementGlobalModal';
import { societeEstPayeurGlobal } from '../utils/societeExclusions';
import { natureRemisePour } from '../utils/natureRemise';
import { formatDate } from '../utils/formatters';

type Props = PrestationsViewProps & {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  /** Dossiers de bloc/hospitalisation sortis avec un solde ouvert (raccourci). */
  reliquatsAHuiter?: number;
  onOuvrirReliquats?: () => void;
};

export function BillingWorkspace({ state, setState, reliquatsAHuiter = 0, onOuvrirReliquats, onFusionPrescription, onAnnulerFusion, ...details }: Props) {
  const formatMoney = (value: number, currency = state.ticketSettings.currency) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  const [mode, setMode] = useState<'factures' | 'detaillee'>('detaillee');
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
  // Fusion : prescription Caisse à absorber + cible choisie dans le modal
  const [fusionSource, setFusionSource] = useState<Prestation | null>(null);
  // Règlement « payeur global » : facture mensuelle (mois + société) à régler
  const [paiementGlobal, setPaiementGlobal] = useState<MonthlyScope | null>(null);
  // Suppression dossier individuel dans la vue détaillée société
  const [prestationToDelete, setPrestationToDelete] = useState<Prestation | null>(null);
  const [prestationDeleteBlocked, setPrestationDeleteBlocked] = useState<{ prestation: Prestation; montantPaye: number } | null>(null);
  // Facturation = sociétés uniquement : les clients comptoir & externes sont
  // regroupés dans l'onglet dédié (règlement encaissé à la validation Caisse).
  const documents = useMemo(() => collectBillingDocuments(state).filter(d => d.category === 'societe'), [state]);
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
      setNotice(`Facture mensuelle ${invoice.number} enregistrée — les impressions suivantes réutilisent ce numéro.`);
      printMonthlyInvoice(invoice, state.ticketSettings);
    } catch (cause) {
      setError(`Impression mensuelle non lancée : ${(cause as Error).message}`);
    } finally { printing.current = false; setBusy(null); }
  }

  const prestationDe = (docId: string) => details.prestations.find(p => p.id === docId);
  const estCaisse = (p: Prestation) => !!(p.sourceInvoiceId || p.id.startsWith('caisse:'));
  const nbFusions = (p: Prestation) => p.fusionsAnnulees?.length || 0;
  // La facture ABSORBÉE doit être celle de la MÊME personne (même assuré) :
  // même personneId ; à défaut (données anciennes) même matricule.
  const memePersonne = (a: Prestation, b: Prestation) =>
    (!!a.personneId && a.personneId === b.personneId)
    || (!a.personneId && !b.personneId && !!a.matricule && a.matricule === b.matricule);
  // Les candidates sont proposées par DATE LA PLUS PROCHE de la prescription
  // d'où l'on lance la fusion (écart absolu en jours, puis date décroissante).
  const candidatesFusion = (source: Prestation) => details.prestations
    .filter(p => p.id !== source.id && p.societeId === source.societeId && memePersonne(source, p))
    .sort((a, b) => {
      const tSource = new Date(source.date).getTime();
      const ecart = (p: Prestation) => {
        const t = new Date(p.date).getTime();
        return Number.isNaN(t) || Number.isNaN(tSource) ? Number.POSITIVE_INFINITY : Math.abs(t - tSource);
      };
      return ecart(a) - ecart(b) || (b.date || '').localeCompare(a.date || '');
    });

  function confirmerFusion(absorbeId: string, libelle?: string) {
    if (!fusionSource || !onFusionPrescription) return;
    onFusionPrescription(absorbeId, fusionSource.id, libelle); // l'absorbée disparaît, la source est conservée
    setFusionSource(null);
    setSocieteDetail(null);
  }
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

  const handleRequestDeletePrestation = (prestation: Prestation, paid = 0) => {
    if (paid > 0 || (prestation.totalPaye && prestation.totalPaye > 0)) {
      setPrestationDeleteBlocked({
        prestation,
        montantPaye: paid || prestation.totalPaye || 0,
      });
      return;
    }
    setPrestationToDelete(prestation);
  };

  const handleConfirmDeletePrestation = () => {
    if (!prestationToDelete) return;
    details.onDeletePrestation(prestationToDelete.id);
    setPrestationToDelete(null);
  };

  return <section className="space-y-4" aria-label="Facturation clients">
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex p-1 bg-surface-hover rounded-xl border border-line text-xs" role="tablist" aria-label="Vues de facturation">
        <button type="button" role="tab" aria-selected={mode === 'detaillee'} onClick={() => setMode('detaillee')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${mode === 'detaillee' ? 'bg-surface text-indigo-700 shadow-2xs' : 'text-ink-secondary hover:text-ink-strong'}`}>
          <FileText className="w-3.5 h-3.5 text-indigo-600" />
          <span>Vue Détaillée (Dossiers)</span>
          <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-indigo-100 text-indigo-800 font-bold">{visible.length}</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === 'factures'} onClick={() => setMode('factures')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer flex items-center gap-1.5 ${mode === 'factures' ? 'bg-surface text-indigo-700 shadow-2xs' : 'text-ink-secondary hover:text-ink-strong'}`}>
          <Receipt className="w-3.5 h-3.5 text-ink-secondary" />
          <span>Vue par Facture</span>
          <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-surface-active text-ink font-bold">{groups.length}</span>
        </button>
      </div>
      {onOuvrirReliquats && (
        <button type="button" onClick={onOuvrirReliquats}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
            reliquatsAHuiter
              ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
              : 'border-line bg-surface text-ink-muted hover:bg-surface-muted'}`}
          title="Patients sortis d'hospitalisation ou de bloc alors qu'il reste une somme due au centre">
          <Banknote className="w-3.5 h-3.5" />
          <span>Reliquats Bloc &amp; Hospit.</span>
          <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-bold ${reliquatsAHuiter ? 'bg-amber-200 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100' : 'bg-surface-hover text-ink-faint'}`}>{reliquatsAHuiter}</span>
        </button>
      )}
    </div>
    {articleIssues.length > 0 && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      {articleIssues.length} article(s) ne peuvent pas être rattachés automatiquement à une famille valide. Aucun classement arbitraire n’a été appliqué.
      <ul className="max-h-48 overflow-auto">{articleIssues.map(a => <li key={a.id}>{a.name} ({a.id}) — {a.reason}{a.family ? ` : ${a.family}` : ''}</li>)}</ul>
    </div>}
    {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-accent-line bg-accent-soft p-3 text-sm text-ink">{notice}</p>}
    {mode === 'factures' ? <div data-testid="monthly-invoices-view" className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface"><table className="w-full text-left text-xs" aria-label="Factures mensuelles">
        <thead className="bg-surface-muted text-ink-secondary"><tr>{['Date', 'Facture', 'Client / Dossier', 'Détail des actes', 'Montant', 'Payé', 'Solde', 'Paiement', 'Impression'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
        <tbody>{groups.map(scope => {
          const id = monthlyScopeId(scope), saved = snapshots.find(i => i.id === id);
          const rows = documentsForScope(documents, scope);
          const totaux = saved ?? billingTotals(rows);
          const missing = saved?.documents.reduce((sum, d) => sum + d.items.filter(i => !i.actCode?.trim()).length, 0) || 0;
          const recipient = saved?.recipient || (scope.category === 'societe' ? state.companies.find(c => c.id === scope.companyId)?.name || rows[0]?.companyName || 'Société' : `Clients ${categoryLabels[scope.category]}`);
          const nbActes = saved?.documents.reduce((sum, d) => sum + d.items.length, 0) ?? rows.reduce((sum, d) => sum + d.items.length, 0);
          const echeance = rows.length ? rows.map(r => r.date).sort()[rows.length - 1] : scope.month;
          // Règlements suivi en direct : un payeur global qui règle après émission
          // doit voir le Payé / Solde de la facture évoluer (contenu resté figé).
          const reglements = billingTotals(rows);
          const payeAffiche = reglements.paid;
          const solde = Math.max(0, Math.round(((totaux.payable ?? totaux.total) - payeAffiche - reglements.rejected) * 100) / 100);
          const societe = scope.category === 'societe' ? details.societes.find(s => s.id === scope.companyId) : undefined;
          const payeurGlobal = scope.category === 'societe' && societeEstPayeurGlobal(societe);
          const detailActes = (saved?.documents ?? rows).flatMap(d => d.items.map(i => ({ ...i, client: d.client })));
          return <tr key={id} className="border-t border-line cursor-pointer hover:bg-surface-hover" data-monthly-scope={id} title="Double-clic : vue détaillée de ce destinataire" onDoubleClick={() => setSocieteDetail(scope)}>
            <td className="p-3 whitespace-nowrap">{saved?.issuedAt ? formatDate(saved.issuedAt) : echeance}<span className="block text-ink-muted">{scope.month}</span></td>
            <td className="p-3 font-mono font-semibold">{saved?.number || '— attribué à la première impression —'}</td>
            <td className="p-3">{recipient}<span className="block text-ink-muted">{categoryLabels[scope.category]} · {saved?.documents.length ?? rows.length} pièce(s) · {nbActes} acte(s)</span></td>
            <td className="p-3"><details><summary className="cursor-pointer">{nbActes} acte(s)</summary><ul className="mt-2 space-y-1 max-h-48 overflow-auto">{detailActes.slice(0, 40).map((item, index) => <li key={index}>{item.client && item.client !== recipient ? <span className="text-ink-muted">{item.client} — </span> : null}{item.description} — {formatMoney(item.amount)}</li>)}{detailActes.length > 40 && <li className="text-ink-muted italic">… {detailActes.length - 40} autre(s)</li>}</ul></details></td>
            <td className="p-3 whitespace-nowrap">{formatMoney(totaux.total)}{missing > 0 && <span className="block text-[11px] text-amber-700">{missing} famille(s) sans rattachement certain</span>}</td>
            <td className="p-3 whitespace-nowrap">{formatMoney(payeAffiche)}</td>
            <td className="p-3 whitespace-nowrap">{formatMoney(solde)}</td>
            <td className="p-3">
              {payeurGlobal && societe && details.onSavePaiement ? (
                solde > 0 ? (
                  <button type="button" onClick={() => setPaiementGlobal(scope)} aria-label={`Enregistrer le paiement de la facture de ${recipient} pour ${scope.month}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 transition cursor-pointer">
                    <Banknote size={15} />Paiement
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300" title="Facture mensuelle soldée">Soldée</span>
                )
              ) : <span className="text-ink-faint" title="Règlements par bordereau dans l'onglet Paiements">—</span>}
            </td>
            <td className="p-3"><button type="button" disabled={!!busy || (IS_WAMP_BUILD && !saved)} onClick={() => void printMonthly(scope)} aria-label={`${saved ? 'Réimprimer' : 'Imprimer'} la facture mensuelle ${scope.month} ${recipient}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 hover:bg-accent-soft text-accent disabled:opacity-50"><Printer size={15} />{busy === id ? 'Enregistrement…' : saved ? 'Réimprimer' : 'Imprimer'}</button>{IS_WAMP_BUILD && missing > 0 && <p className="mt-1 text-[11px]">Réparation à effectuer côté serveur MySQL.</p>}</td>
          </tr>;
        })}</tbody>
      </table>{!groups.length && <p className="p-6 text-center text-sm text-ink-muted">Aucune facture pour cette sélection.</p>}</div>
    </div> : <div data-testid="billing-detail-view">
      <PrestationsView {...details} prestations={visiblePrestations} articles={state.articles} hideViewSwitcher onFusionPrescription={onFusionPrescription} onFusionner={p => setFusionSource(p)} onAnnulerFusion={onAnnulerFusion} onPrintPrestation={p => { const doc = documents.find(d => d.id === p.id); if (doc) printIndividualBillingDocument(state, doc); }} />
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
                <thead className="bg-surface-muted text-ink-secondary">
                  <tr>
                    {['Date', 'Facture', 'Assuré / Client', 'Sous-soc.', 'Actes', 'Brut', 'À rembourser', 'Payé', 'Solde', 'Statut', 'Actions'].map(label => (
                      <th className={`p-2.5 ${label === 'Actions' ? 'text-right' : ''}`} key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lignes.map(d => {
                    const p = prestationDe(d.id);
                    const nbAjouts = p ? ajoutsDe(p) : 0;
                    const solde = Math.max(0, d.payable - d.paid - d.rejected);
                    return (
                      <tr key={d.id} className={`border-t border-line hover:bg-surface-hover${p ? ' cursor-pointer' : ''}`}
                          title={p ? 'Double-clic : ouvrir la prescription' : undefined}
                          onDoubleClick={() => { if (!p) return; setPrescription(p); }}>
                        <td className="p-2.5 whitespace-nowrap">{formatDate(d.date)}</td>
                        <td className="p-2.5 font-mono font-semibold">{d.number}</td>
                        <td className={`p-2.5 ${p ? 'font-semibold text-indigo-700 dark:text-indigo-300 underline decoration-dotted underline-offset-2' : ''}`}>
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
                        <td className="p-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              type="button"
                              onClick={() => printIndividualBillingDocument(state, d)}
                              title="Imprimer la facture"
                              aria-label={`Imprimer la facture ${d.number}`}
                              className="p-1.5 text-accent hover:bg-accent-soft rounded-lg cursor-pointer transition"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                            {p && onFusionPrescription && (
                              <button
                                type="button"
                                onClick={() => setFusionSource(p)}
                                title="Fusionner avec une autre facture (regrouper deux factures, même à des dates différentes, en une seule)"
                                aria-label={`Fusionner la facture ${d.number}`}
                                className="p-1.5 text-ink-faint hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer transition"
                              >
                                <Merge className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {p && (
                              <button
                                type="button"
                                onClick={() => setPrescription(p)}
                                title="Modifier la prescription — ajouter une VENTE OMISE ou une ORDONNANCE EXTERNE"
                                aria-label={`Modifier la prescription ${d.number}`}
                                className="p-1.5 text-ink-faint hover:text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer transition"
                              >
                                <ClipboardEdit className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {p && (
                              <button
                                type="button"
                                onClick={() => handleRequestDeletePrestation(p, d.paid)}
                                title="Supprimer le dossier de soins"
                                aria-label={`Supprimer le dossier ${d.number}`}
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
                  {!lignes.length && <tr><td colSpan={11} className="p-6 text-center text-ink-muted italic">Aucune prescription pour cette sélection.</td></tr>}
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

    {/* ===== MODAL : fusion de deux prescriptions (patient revenu deux fois) ===== */}
    {fusionSource && (() => {
      const candidates = candidatesFusion(fusionSource);
      return <FusionPrescriptionModal
        source={fusionSource}
        candidates={candidates}
        societeNom={state.companies.find(c => c.id === fusionSource.societeId)?.name || fusionSource.societeNom || ''}
        formatMoney={formatMoney}
        onClose={() => setFusionSource(null)}
        onConfirm={confirmerFusion}
      />;
    })()}

    {/* ===== MODAL : édition de la prescription (omissions / ordonnances externes) ===== */}
    {prescription && (
      <PrescriptionEditModal
        prestation={prescription}
        familles={details.familles}
        articles={state.articles}
        natureRemise={natureRemisePour(details.societes, details.personnes, prescription.societeId, prescription.personneId)}
        onClose={() => setPrescription(null)}
        onSave={enregistrerPrescription}
      />
    )}

    {/* ===== MODAL : règlement global d'une facture mensuelle (société payeur global) ===== */}
    {paiementGlobal && (() => {
      const societe = details.societes.find(s => s.id === paiementGlobal.companyId);
      const enregistrerPaiement = details.onSavePaiement;
      if (!societe || !enregistrerPaiement) return null;
      return <PaiementGlobalModal
        societe={societe}
        month={paiementGlobal.month}
        numeroFactureMensuelle={snapshots.find(i => i.id === monthlyScopeId(paiementGlobal))?.number}
        destinataire={state.companies.find(c => c.id === paiementGlobal.companyId)?.name || societe.nom}
        documents={documentsForScope(documents, paiementGlobal)}
        estPrestation={doc => details.prestations.some(p => p.id === doc.id)}
        prestations={details.prestations}
        numerosBordereauxExistants={(details.paiements || []).map(p => p.numeroBordereau).filter((n): n is string => !!n)}
        onClose={() => setPaiementGlobal(null)}
        onEnregistrer={paiement => {
          enregistrerPaiement(paiement, []);
          setPaiementGlobal(null);
          setNotice(`Règlement de ${formatMoney(paiement.totalPaye)} enregistré pour ${societe.nom} — bordereau ${paiement.numeroBordereau}.`);
        }}
      />;
    })()}

    {/* Confirmation Modal: Delete Single Dossier */}
    {prestationToDelete && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-rose-100 flex flex-col">
          <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
            <div className="flex items-center space-x-2.5 text-rose-900">
              <div className="p-2 bg-rose-100 rounded-xl text-rose-700">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Supprimer le Dossier de Soins ?</h3>
                <p className="text-xs text-rose-700 font-medium">Suppression de la prescription individuelle</p>
              </div>
            </div>
            <button
              onClick={() => setPrestationToDelete(null)}
              className="p-1.5 text-rose-400 hover:text-rose-700 hover:bg-rose-100 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-3.5 text-xs text-ink">
            <p>
              Êtes-vous sûr de vouloir supprimer ce dossier de soins ?
            </p>

            <div className="bg-surface-muted border border-line rounded-xl p-3.5 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-ink-muted font-medium">Patient / Assuré :</span>
                <span className="font-bold text-ink-strong">{prestationToDelete.nomAgent || details.personnes.find(p => p.id === prestationToDelete.personneId)?.nomPrenom || prestationToDelete.matricule || 'Assuré'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-muted font-medium">N° Facture :</span>
                <span className="font-mono font-semibold text-ink-strong">{prestationToDelete.numeroFacture}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-muted font-medium">Date des soins :</span>
                <span className="font-semibold text-ink-strong">{formatDate(prestationToDelete.date)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-ink-muted font-medium">Total brut :</span>
                <span className="font-bold text-ink-strong">{formatMoney(prestationToDelete.totalPrestation || prestationToDelete.montantTotal || 0)}</span>
              </div>
            </div>
          </div>

          <div className="px-6 py-4 bg-surface-muted border-t border-line-soft flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setPrestationToDelete(null)}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-line text-ink bg-surface hover:bg-surface-hover transition cursor-pointer"
            >
              Non, Annuler
            </button>
            <button
              type="button"
              onClick={handleConfirmDeletePrestation}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Oui, Supprimer le dossier</span>
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Blocked Modal: Single Dossier with Payments Cannot Be Deleted */}
    {prestationDeleteBlocked && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-amber-200 flex flex-col">
          <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
            <div className="flex items-center space-x-2.5 text-amber-900">
              <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold">Suppression Impossible</h3>
                <p className="text-xs text-amber-700 font-medium">Dossier avec règlement associé</p>
              </div>
            </div>
            <button
              onClick={() => setPrestationDeleteBlocked(null)}
              className="p-1.5 text-amber-400 hover:text-amber-700 hover:bg-amber-100 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-3.5 text-xs text-ink">
            <p>
              Ce dossier de soins ne peut pas être supprimé car un montant de{' '}
              <strong className="text-emerald-700 font-mono font-bold">
                {formatMoney(prestationDeleteBlocked.montantPaye)}
              </strong>{' '}
              a déjà été perçu / réglé par l'assurance ou le client.
            </p>
            <p className="text-ink-muted">
              Pour pouvoir supprimer ce dossier, veuillez d'abord annuler ou délier les encaissements correspondants dans l'onglet des paiements.
            </p>
          </div>

          <div className="px-6 py-4 bg-surface-muted border-t border-line-soft flex items-center justify-end">
            <button
              type="button"
              onClick={() => setPrestationDeleteBlocked(null)}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition cursor-pointer"
            >
              Compris
            </button>
          </div>
        </div>
      </div>
    )}
  </section>;
}
