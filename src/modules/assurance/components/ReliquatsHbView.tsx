import { useMemo, useState } from 'react';
import { AlertTriangle, Banknote, Download, Info, Printer, Search, X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { AppState } from '../../../store';
import { addAuditLog, addJourneyEvent } from '../../../store';
import type { HbRecord } from '../../../types';
import { printDocument } from '../../../utils/printDocument';
import { printHbPaymentTicket } from '../../../utils/printTicket';
import { classeurDepuisLignes, telechargerClasseur } from '../../../utils/exportFichier';
import { hbReste } from '../../../utils/hbDossier';
import {
  FILTRES_RELICATS_PAR_DEFAUT, listerReliquatsHb, lignesExcelReliquats, synthetiserReliquats,
  type FiltreTypeHb, type ReliquatHb, type TriReliquat,
} from '../utils/reliquatsHb';
import MoneyInput from '../../../components/MoneyInput';

type Props = { state: AppState; setState: React.Dispatch<React.SetStateAction<AppState>> };

const STATUT_STYLES: Record<ReliquatHb['statut'], string> = {
  impaye: 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30',
  partiel: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30',
  solde: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30',
  'trop-percu': 'bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-500/10 dark:text-sky-300 dark:border-sky-500/30',
};
const STATUT_LIBELLES: Record<ReliquatHb['statut'], string> = {
  impaye: 'Aucun règlement',
  partiel: 'Partiellement réglé',
  solde: 'Soldé',
  'trop-percu': 'Trop-perçu',
};

/**
 * Onglet « Bloc & Hospit. — reliquats » de la Facturation : les patients sortis
 * sur autorisation alors qu'ils doivent encore de l'argent au centre.
 * L'encaissement saisi ici est écrit dans `state.hbRecords` — le dossier de la
 * Caisse lui-même — donc aucun double de saisie et aucun total qui diverge.
 */
export function ReliquatsHbView({ state, setState }: Props) {
  const devise = state.ticketSettings.currency;
  const formatMoney = (value: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Math.round(value * 100) / 100)} ${devise}`;
  const [filtres, setFiltres] = useState(FILTRES_RELICATS_PAR_DEFAUT);
  const [encaissement, setEncaissement] = useState<{ ligne: ReliquatHb; montant: string; ticket: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const [erreur, setErreur] = useState('');

  const lignes = useMemo(() => listerReliquatsHb(state, filtres), [state, filtres]);
  const synthese = useMemo(() => synthetiserReliquats(lignes), [lignes]);

  const societes = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of state.hbRecords || []) {
      if (!record.company) continue;
      map.set(record.company, state.companies.find(c => c.id === record.company)?.name || record.company);
    }
    return [...map.entries()].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [state.hbRecords, state.companies]);

  const set = <K extends keyof typeof filtres>(cle: K, valeur: (typeof filtres)[K]) =>
    setFiltres(prev => ({ ...prev, [cle]: valeur }));

  function exporterExcel() {
    if (!lignes.length) { setErreur('Aucun dossier à exporter avec ces filtres.'); return; }
    const resultat = telechargerClasseur(
      classeurDepuisLignes(lignesExcelReliquats(lignes, devise), 'Reliquats_Sortie'),
      `Reliquats_Bloc_Hospitalisation_${new Date().toISOString().split('T')[0]}.xlsx`,
      { signaler: setErreur },
    );
    if (resultat.ok) { setNotice(`Excel : ${resultat.message}`); setErreur(''); }
  }

  function imprimerEtat(lignesAImprimer: ReliquatHb[], titre: string) {
    if (!lignesAImprimer.length) { setErreur("Rien à imprimer : aucun dossier dans cette sélection."); return; }
    const etablissement = state.ticketSettings.facilityName || 'Centre';
    const totalReste = lignesAImprimer.reduce((s, l) => s + l.reste, 0);
    const totalFacture = lignesAImprimer.reduce((s, l) => s + l.totalFacture, 0);
    const totalPaye = lignesAImprimer.reduce((s, l) => s + l.totalPaye, 0);
    const corps = lignesAImprimer.map(l => [
      '<tr>',
      `<td>${echapper(l.sortiLe ? l.sortiLe.slice(0, 10) : '—')}${l.joursDepuisSortie >= 0 ? ` <span class="muted">(${l.joursDepuisSortie} j)</span>` : ''}</td>`,
      `<td>${echapper(l.patientName)}${l.dossier ? `<br><span class="muted">Dossier ${echapper(l.dossier)}</span>` : ''}</td>`,
      `<td>${echapper(l.numeroFacture || '—')}</td>`,
      `<td>${echapper(l.typeLabel)}</td>`,
      `<td>${echapper(l.societeNom || 'Comptoir / externe')}${l.sousSociete ? `<br><span class="muted">${echapper(l.sousSociete)}</span>` : ''}</td>`,
      `<td class="num">${echapper(formatMoney(l.totalFacture))}</td>`,
      `<td class="num">${echapper(formatMoney(l.totalPaye))}</td>`,
      `<td class="num due">${echapper(formatMoney(l.reste))}</td>`,
      `<td>${echapper(l.autorisePar || '—')}${l.donneurOrdre ? `<br><span class="muted">Ordre : ${echapper(l.donneurOrdre)}</span>` : ''}${l.motif ? `<br><span class="muted">${echapper(l.motif)}</span>` : ''}</td>`,
      '</tr>',
    ].join('')).join('');
    const filtresResume = [
      filtres.type !== 'tous' ? `service ${filtres.type === 'bloc' ? 'bloc opératoire' : 'hospitalisation'}` : '',
      filtres.sortieDu || filtres.sortieAu ? `sorties du ${filtres.sortieDu || '…'} au ${filtres.sortieAu || '…'}` : '',
      filtres.recherche.trim() ? `recherche « ${filtres.recherche.trim()} »` : '',
    ].filter(Boolean).join(' · ');
    const html = [
      '<!doctype html><html lang="fr"><head><meta charset="utf-8">',
      `<title>${echapper(titre)}</title>`,
      '<style>',
      '@page{size:A4 landscape;margin:12mm 10mm 16mm;@bottom-left{content:"Page " counter(page) " / " counter(pages);font:9px Arial,sans-serif}}',
      '*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#000;background:#fff;margin:0}',
      'h1{font-size:17px;margin:0 0 4px}.meta{font-size:10px;margin:0 0 10px}',
      'table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}',
      'th,td{border:1px solid #000;padding:4px;vertical-align:top;overflow-wrap:anywhere}th{background:#eee;text-align:left}',
      'thead{display:table-header-group}tr{break-inside:avoid}',
      '.num{text-align:right;white-space:nowrap}.due{font-weight:bold}.muted{font-size:9px}',
      '.totals{margin-top:10px;text-align:right;font-size:12px}.totals strong{font-size:14px}.note{font-size:9px;margin-top:10px}',
      '</style></head><body>',
      `<h1>${echapper(titre)}</h1>`,
      `<p class="meta">${echapper(etablissement)} — édité le ${new Date().toLocaleDateString('fr-FR')} — ${lignesAImprimer.length} dossier(s)${filtresResume ? ` — ${echapper(filtresResume)}` : ''} — ${echapper(etablissement)}</p>`,
      '<table><thead><tr>',
      '<th style="width:9%">Sorti le</th><th style="width:17%">Patient / dossier</th><th style="width:11%">N° facture</th>',
      '<th style="width:9%">Service</th><th style="width:14%">Société</th><th style="width:9%">Facturé</th>',
      '<th style="width:9%">Réglé</th><th style="width:9%">Reste dû</th><th style="width:13%">Autorisation de sortie</th>',
      `</tr></thead><tbody>${corps}</tbody></table>`,
      `<p class="totals">Total facturé ${echapper(formatMoney(totalFacture))} · déjà réglé ${echapper(formatMoney(totalPaye))} · <strong>reste à recouvrer ${echapper(formatMoney(totalReste))}</strong></p>`,
      '<p class="note">Dossiers de bloc opératoire et d\u2019hospitalisation fermés par une autorisation de sortie alors qu\u2019il restait une somme due au centre. Les montants sont ceux du dossier de caisse (encaissements de la caisse et de la pharmacie de garde inclus) : la ligne se met à jour dès qu\u2019un règlement est saisi. Une contestation de montant se règle au guichet de la caisse.</p>',
      '</body></html>',
    ].join('');
    printDocument(html, titre);
    setNotice("État envoyé à l'impression — choisissez « Enregistrer en PDF » pour l'archiver ou le transmettre.");
    setErreur('');
  }

  function enregistrerEncaissement() {
    if (!encaissement) return;
    const ligne = encaissement.ligne;
    const record = (state.hbRecords || []).find(r => r.id === ligne.id);
    if (!record) { setErreur('Dossier introuvable : il a peut-être été supprimé à la caisse.'); setEncaissement(null); return; }
    const reste = hbReste(record);
    const montant = Math.round((Number(encaissement.montant) || 0) * 100) / 100;
    if (!(montant > 0)) { setErreur('Saisissez un montant supérieur à 0.'); return; }
    if (reste > 0 && montant > reste + 0.001) { setErreur(`Le montant dépasse le reste dû (${formatMoney(reste)}).`); return; }
    const paiement = {
      id: uuidv4(),
      amount: montant,
      paidBy: state.currentUser?.name || 'Facturation',
      paidByUserId: state.currentUser?.id,
      date: new Date().toISOString(),
      receivedBy: 'caisse' as const,
    };
    setState(prev => {
      const hbRecords = (prev.hbRecords || []).map(r => r.id === record.id ? { ...r, payments: [...(r.payments || []), paiement] } : r);
      const next: AppState = { ...prev, hbRecords, auditLogs: [...prev.auditLogs] };
      const solde = hbReste((hbRecords.find(r => r.id === record.id) || record) as HbRecord);
      addAuditLog(next, 'RELIQUAT_HB_REGLE', `Reliquat ${ligne.typeLabel.toLowerCase()} réglé en facturation : ${ligne.patientName} — ${formatMoney(montant)} reçus, reste ${formatMoney(Math.max(0, solde))} (dossier ${ligne.numeroFacture || ligne.dossier || ligne.id})`);
      if (ligne.patientId) {
        addJourneyEvent(next, {
          patientId: ligne.patientId, department: 'caisse',
          action: "Règlement d'un reliquat de sortie", status: solde <= 0 ? 'registered' : 'consulted_awaiting_payment',
          details: `${formatMoney(montant)} encaissés en facturation sur le dossier ${ligne.typeLabel.toLowerCase()} — reste ${formatMoney(Math.max(0, solde))}`,
          actorId: prev.currentUser?.id, actorName: prev.currentUser?.name, hospitalizationId: record.id,
        });
      }
      return next;
    });
    if (encaissement.ticket) {
      const patient = record.patientId ? state.patients.find(p => p.id === record.patientId) : undefined;
      printHbPaymentTicket(
        state.ticketSettings,
        { ...record, payments: [...(record.payments || []), paiement] },
        paiement,
        Math.max(0, reste - montant),
        state.currentUser || undefined,
        patient,
      );
    }
    const nouveauReste = reste - montant;
    setNotice(`${formatMoney(montant)} encaissés sur le dossier de ${ligne.patientName} — ${nouveauReste <= 0.001 ? 'dossier soldé.' : `reste ${formatMoney(nouveauReste)}.`}`);
    setErreur('');
    setEncaissement(null);
  }

  return (
    <section className="space-y-4" aria-label="Reliquats de sortie — bloc et hospitalisation">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink-strong">Bloc &amp; Hospitalisation — argent dû après autorisation de sortie</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Suivi et recouvrement des soldes dus pour les patients sortis de bloc ou d'hospitalisation.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={exporterExcel}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 cursor-pointer">
              <Download className="h-4 w-4 text-emerald-300" /><span>Exporter Excel (.xlsx)</span>
            </button>
            <button type="button" onClick={() => imprimerEtat(lignes, 'État des reliquats de sortie — Bloc & Hospitalisation')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink transition hover:bg-surface-muted cursor-pointer">
              <Printer className="h-4 w-4 text-ink-muted" /><span>Imprimer / PDF</span>
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi titre="Dossiers sortis non soldés" valeur={String(synthese.nbDossiers)} detail={`${synthese.nbHospit} hospitalisation(s) · ${synthese.nbBloc} bloc(s)`} />
          <Kpi titre="Reste à recouvrer" valeur={formatMoney(synthese.totalReste)} detail={`facturé ${formatMoney(synthese.totalFacture)} · réglé ${formatMoney(synthese.totalPaye)}`} alerte={synthese.totalReste > 0} />
          <Kpi titre="Relances de plus de 30 jours" valeur={String(synthese.nbPlus30Jours)} detail={formatMoney(synthese.montantPlus30Jours)} alerte={synthese.nbPlus30Jours > 0} />
          <Kpi titre="Le plus ancien" valeur={synthese.plusAncienJours > 0 ? `${synthese.plusAncienJours} j` : '—'} detail={`${synthese.nbImpayes} sans aucun règlement · ${synthese.nbPartiels} partiel(s)`} />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-3 text-xs">
        <label className="flex flex-col gap-1 font-semibold text-ink-secondary">Service
          <select value={filtres.type} onChange={e => set('type', e.target.value as FiltreTypeHb)}
            className="rounded-lg border border-line bg-field px-2 py-1.5 text-xs font-normal text-ink">
            <option value="tous">Bloc + Hospitalisation</option>
            <option value="hospit">Hospitalisation</option>
            <option value="bloc">Bloc opératoire</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 font-semibold text-ink-secondary">Société
          <select value={filtres.societeId} onChange={e => set('societeId', e.target.value)}
            className="max-w-[220px] rounded-lg border border-line bg-field px-2 py-1.5 text-xs font-normal text-ink">
            <option value="ALL">Toutes</option>
            <option value="">Sans société (comptoir / externe)</option>
            {societes.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-semibold text-ink-secondary">Sortie du
          <input type="date" value={filtres.sortieDu} onChange={e => set('sortieDu', e.target.value)}
            className="rounded-lg border border-line bg-field px-2 py-1.5 text-xs text-ink" />
        </label>
        <label className="flex flex-col gap-1 font-semibold text-ink-secondary">au
          <input type="date" value={filtres.sortieAu} onChange={e => set('sortieAu', e.target.value)}
            className="rounded-lg border border-line bg-field px-2 py-1.5 text-xs text-ink" />
        </label>
        <label className="flex min-w-[200px] flex-1 flex-col gap-1 font-semibold text-ink-secondary">Recherche
          <span className="relative">
            <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-ink-faint" />
            <input value={filtres.recherche} onChange={e => set('recherche', e.target.value)}
              placeholder="nom, dossier, n° facture, motif, donneur d'ordre…"
              className="w-full rounded-lg border border-line bg-field py-1.5 pl-7 pr-7 text-xs text-ink" />
            {filtres.recherche && (
              <button type="button" onClick={() => set('recherche', '')} aria-label="Effacer la recherche"
                className="absolute right-1.5 top-1.5 rounded p-0.5 text-ink-faint hover:text-ink cursor-pointer"><X className="h-3.5 w-3.5" /></button>
            )}
          </span>
        </label>
        <label className="flex flex-col gap-1 font-semibold text-ink-secondary">Tri
          <select value={filtres.tri} onChange={e => set('tri', e.target.value as TriReliquat)}
            className="rounded-lg border border-line bg-field px-2 py-1.5 text-xs font-normal text-ink">
            <option value="urgence">Plus urgent (somme due)</option>
            <option value="sortie">Sortie la plus récente</option>
            <option value="montant">Montant décroissant</option>
            <option value="patient">Nom du patient</option>
            <option value="societe">Société</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 font-semibold text-ink-secondary">
          <input type="checkbox" checked={filtres.inclureSoldes} onChange={e => set('inclureSoldes', e.target.checked)} className="h-3.5 w-3.5" />
          Afficher aussi les soldés
        </label>
        <button type="button" onClick={() => { setFiltres(FILTRES_RELICATS_PAR_DEFAUT); setNotice(''); setErreur(''); }}
          className="pb-1.5 text-xs font-semibold text-accent underline cursor-pointer">Réinitialiser les filtres</button>
      </div>

      {erreur && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{erreur}
        </p>
      )}
      {notice && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-accent-line bg-accent-soft p-3 text-sm text-ink">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />{notice}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-left text-xs" aria-label="Reliquats de sortie par dossier">
          <thead className="bg-surface-muted text-ink-secondary">
            <tr>
              {['Sorti le', 'Patient / dossier', 'N° facture', 'Service', 'Société', 'Facturé', 'Réglé', 'Reste dû', 'Autorisation de sortie', 'Action'].map(entete => (
                <th key={entete} className="whitespace-nowrap p-2.5">{entete}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map(l => (
              <tr key={l.id} className="border-t border-line align-top hover:bg-surface-hover">
                <td className="whitespace-nowrap p-2.5">
                  {l.sortiLe ? l.sortiLe.slice(0, 10) : '—'}
                  {l.joursDepuisSortie >= 0 && (
                    <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${l.joursDepuisSortie > 30 ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-surface-hover text-ink-secondary'}`}>{l.joursDepuisSortie} j</span>
                  )}
                </td>
                <td className="p-2.5 font-semibold text-ink">{l.patientName}{l.dossier && <span className="block font-normal text-ink-muted">{l.dossier}</span>}</td>
                <td className="p-2.5 font-mono">{l.numeroFacture || '—'}</td>
                <td className="whitespace-nowrap p-2.5">{l.typeLabel}</td>
                <td className="p-2.5">{l.societeNom || <span className="text-ink-faint">Comptoir / externe</span>}{l.sousSociete && <span className="block text-ink-muted">{l.sousSociete}</span>}</td>
                <td className="whitespace-nowrap p-2.5 text-right font-mono">{formatMoney(l.totalFacture)}</td>
                <td className="whitespace-nowrap p-2.5 text-right font-mono">{formatMoney(l.totalPaye)}</td>
                <td className="whitespace-nowrap p-2.5 text-right font-mono font-bold">
                  <span className={l.reste > 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}>{formatMoney(l.reste)}</span>
                  <span className={`mt-1 block w-fit rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${STATUT_STYLES[l.statut]}`}>{STATUT_LIBELLES[l.statut]}</span>
                </td>
                <td className="p-2.5 text-ink-secondary">
                  {l.autorisePar || '—'}
                  {l.donneurOrdre && <span className="block text-[10px] text-ink-muted">Ordre : {l.donneurOrdre}</span>}
                  {l.motif && <span className="block text-[10px] text-ink-muted">{l.motif}</span>}
                </td>
                <td className="whitespace-nowrap p-2.5 text-right">
                  {l.reste > 0 ? (
                    <div className="flex flex-col items-end gap-1">
                      <button type="button" onClick={() => { setEncaissement({ ligne: l, montant: String(Math.round(l.reste * 100) / 100), ticket: true }); setErreur(''); setNotice(''); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-700 transition hover:bg-emerald-100 cursor-pointer dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                        <Banknote className="h-3.5 w-3.5" />Encaisser
                      </button>
                      <button type="button" onClick={() => imprimerEtat([l], `Relance de paiement — ${l.patientName}`)}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink-muted underline transition hover:text-ink cursor-pointer">
                        <Printer className="h-3 w-3" />Imprimer la relance
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-ink-faint" title="Aucun montant dû ; un trop-perçu se rembourse au guichet de la caisse">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!lignes.length && (
              <tr>
                <td colSpan={10} className="p-6 text-center text-sm text-ink-muted">
                  {filtres.inclureSoldes
                    ? "Aucun dossier de bloc ou d'hospitalisation n'a encore reçu d'autorisation de sortie."
                    : 'Aucun reliquat : tout ce qui est sorti a été réglé. La liste se remplit dès qu\u2019une autorisation de sortie est enregistrée à la caisse alors qu\u2019il reste une somme due.'}
                </td>
              </tr>
            )}
          </tbody>
          {!!lignes.length && (
            <tfoot className="bg-surface-muted font-semibold text-ink">
              <tr>
                <td className="p-2.5" colSpan={5}>Total de la sélection — {lignes.length} dossier(s)</td>
                <td className="p-2.5 text-right font-mono">{formatMoney(synthese.totalFacture)}</td>
                <td className="p-2.5 text-right font-mono">{formatMoney(synthese.totalPaye)}</td>
                <td className="p-2.5 text-right font-mono text-rose-700 dark:text-rose-300">{formatMoney(synthese.totalReste)}</td>
                <td className="p-2.5" colSpan={2}>
                  {synthese.parSociete.length > 1 && (
                    <details className="text-[10px] font-normal text-ink-secondary">
                      <summary className="cursor-pointer">Répartition par société ({synthese.parSociete.length})</summary>
                      <ul className="mt-1 max-h-32 overflow-auto">
                        {synthese.parSociete.slice(0, 20).map(s => <li key={s.societeId || 'sans-societe'}>{s.societeNom} : {s.nb} dossier(s) — {formatMoney(s.reste)}</li>)}
                      </ul>
                    </details>
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {encaissement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onMouseDown={e => { if (e.target === e.currentTarget) setEncaissement(null); }}>
          <div role="dialog" aria-label={`Encaisser un reliquat pour ${encaissement.ligne.patientName}`} className="w-full max-w-lg rounded-2xl bg-surface p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-line-soft pb-3">
              <div>
                <h3 className="text-base font-bold text-ink-strong">Encaisser le reliquat de sortie</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {encaissement.ligne.patientName} — {encaissement.ligne.typeLabel}
                  {encaissement.ligne.numeroFacture ? ` — facture ${encaissement.ligne.numeroFacture}` : ''}
                  {encaissement.ligne.sortiLe ? ` — sorti le ${encaissement.ligne.sortiLe.slice(0, 10)}` : ''}
                </p>
              </div>
              <button onClick={() => setEncaissement(null)} aria-label="Fermer"
                className="cursor-pointer rounded-xl p-2 text-ink-faint transition hover:bg-surface-hover hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl border border-line bg-surface-muted p-2"><dt className="text-ink-muted">Facturé</dt><dd className="mt-0.5 font-mono text-sm font-bold">{formatMoney(encaissement.ligne.totalFacture)}</dd></div>
              <div className="rounded-xl border border-line bg-surface-muted p-2"><dt className="text-ink-muted">Déjà réglé</dt><dd className="mt-0.5 font-mono text-sm font-bold">{formatMoney(encaissement.ligne.totalPaye)}</dd></div>
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-2 dark:border-rose-500/30 dark:bg-rose-500/10"><dt className="text-ink-muted">Reste dû</dt><dd className="mt-0.5 font-mono text-sm font-bold text-rose-700 dark:text-rose-300">{formatMoney(encaissement.ligne.reste)}</dd></div>
            </dl>
            <label className="mt-4 block text-xs font-semibold text-ink-secondary">Montant reçu ({devise})
              <MoneyInput value={Number(encaissement.montant) || 0} decimals={2} autoFocus
                onChange={n => setEncaissement(prev => (prev ? { ...prev, montant: String(n) } : prev))}
                onKeyDown={e => { if (e.key === 'Enter') enregistrerEncaissement(); }}
                ariaLabel="Montant reçu" title="Montant reçu — séparateur de milliers automatique (ex : 49 450)"
                className="mt-1 w-full rounded-xl border border-line bg-field px-3 py-2 font-mono text-sm text-ink" />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setEncaissement(prev => (prev ? { ...prev, montant: String(Math.round(prev.ligne.reste * 100) / 100) } : prev))}
                className="cursor-pointer rounded-lg border border-line px-2 py-1 text-[10px] font-semibold text-ink-muted transition hover:bg-surface-hover">Solde total dû</button>
              <button type="button" onClick={() => setEncaissement(prev => (prev ? { ...prev, montant: String(Math.round((prev.ligne.reste / 2) * 100) / 100) } : prev))}
                className="cursor-pointer rounded-lg border border-line px-2 py-1 text-[10px] font-semibold text-ink-muted transition hover:bg-surface-hover">La moitié</button>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-ink cursor-pointer">
              <input type="checkbox" checked={encaissement.ticket} onChange={e => setEncaissement(prev => (prev ? { ...prev, ticket: e.target.checked } : prev))} className="h-3.5 w-3.5" />
              Imprimer le ticket de paiement (58 mm), comme à la caisse
            </label>
            <p className="mt-3 rounded-xl border border-line bg-surface-muted p-2 text-[10px] text-ink-muted">
              Mise à jour immédiate du dossier de caisse.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEncaissement(null)}
                className="cursor-pointer rounded-xl border border-line px-3 py-2 text-xs font-semibold text-ink transition hover:bg-surface-hover">Annuler</button>
              <button type="button" onClick={enregistrerEncaissement}
                className="cursor-pointer rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-500">Enregistrer l’encaissement</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Kpi({ titre, valeur, detail, alerte }: { titre: string; valeur: string; detail?: string; alerte?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alerte ? 'border-amber-300 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10' : 'border-line bg-surface-muted'}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">{titre}</p>
      <p className="mt-0.5 font-mono text-lg font-bold text-ink-strong">{valeur}</p>
      {detail && <p className="text-[10px] text-ink-muted">{detail}</p>}
    </div>
  );
}

/** Le document imprimable est du HTML brut : tout ce qui vient de la base est échappé. */
function echapper(valeur: unknown): string {
  return String(valeur ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
