import type { AppState } from '../../store';
import type { TicketSettings } from '../../types';
import { INVOICE_HEADER_STYLE, invoiceHeaderMarkup } from '../../utils/invoiceHeader';
import { printDocument } from '../../utils/printDocument';
import { groupBillingItemsByFamily } from './billingFamilies';
import { billingFacility, localBillingDate, billingTotals, type BillingDocument, type MonthlyInvoice } from './monthlyBilling';
import { libelleReductionCommun, libelleReductionCommunCourt, natureRemiseLabel } from '../../utils/natureRemise';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const decimal = (value: number) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
/** Quantité sans décimales inutiles : 20 (et non 20,00), 1,5 si besoin. */
const quantite = (value: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
const dateLabel = (value: string, short = false) => {
  const date = localBillingDate(value);
  const [year, month, day] = date.split('-');
  return date ? `${day}/${month}/${short ? year.slice(-2) : year}` : '—';
};
const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const monthLabel = (value: string) => `${monthNames[Number(value.slice(5, 7)) - 1] || value} ${value.slice(0, 4)}`;

/** French amounts, including cents; never truncate the amount printed in figures. */
export function billingAmountInWords(value: number, currency: string): string {
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.round(value * 100))) return 'Montant non disponible en lettres';
  const units = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  function small(n: number, beforeMille = false): string {
    if (n < 20) return units[n];
    if (n < 70) { const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'][Math.floor(n / 10)]; return tens + (n % 10 === 1 ? ' et un' : n % 10 ? `-${units[n % 10]}` : ''); }
    if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${small(n - 60)}`;
    if (n < 100) return n === 80 ? `quatre-vingt${beforeMille ? '' : 's'}` : `quatre-vingt-${small(n - 80)}`;
    const h = Math.floor(n / 100), rest = n % 100;
    return `${h === 1 ? '' : units[h] + ' '}cent${!rest && h > 1 && !beforeMille ? 's' : ''}${rest ? ' ' + small(rest, beforeMille) : ''}`;
  }
  function integer(n: number): string {
    if (n < 1000) return small(n);
    for (const [size, name] of [[1e12, 'billion'], [1e9, 'milliard'], [1e6, 'million']] as const) {
      if (n >= size) { const count = Math.floor(n / size); return `${integer(count)} ${name}${count > 1 ? 's' : ''}${n % size ? ' ' + integer(n % size) : ''}`; }
    }
    const thousands = Math.floor(n / 1000);
    return `${thousands === 1 ? '' : small(thousands, true) + ' '}mille${n % 1000 ? ' ' + small(n % 1000) : ''}`;
  }
  const cents = Math.round(value * 100), whole = Math.floor(cents / 100), rest = cents % 100;
  const label = currency === 'Ar' ? 'Ariary' : currency === '€' ? `euro${whole > 1 ? 's' : ''}` : currency === '$' ? `dollar${whole > 1 ? 's' : ''}` : currency === 'Fc' ? `franc${whole > 1 ? 's' : ''}` : currency;
  return `${integer(whole)} ${label}${rest ? ` et ${integer(rest)} centime${rest > 1 ? 's' : ''}` : ''}`;
}

// The common Administration header is presentation-only; financial snapshots stay frozen.
// Native pagination handles variable-height rows and repeats the column headings.
type PrintMode = 'monthly' | 'individual' | 'duo' | 'fusion';
const css = (mode: PrintMode) => `@page{size:${(mode === 'duo' || mode === 'fusion') ? 'A4 landscape' : `${mode === 'monthly' ? 'A4' : 'A5'} portrait`};margin:${mode === 'monthly' ? '12mm 10mm 16mm' : (mode === 'duo' || mode === 'fusion') ? '8mm' : '8mm 7mm 12mm'};@bottom-left{content:"Page " counter(page) "/" counter(pages);font:9px Arial,sans-serif;color:#000}}
*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#000;background:#fff;margin:0}h1{font-size:19px;text-align:center;margin:8px 0 14px}p{margin:8px 0}table{font:inherit;width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #000;padding:4px;overflow-wrap:anywhere;vertical-align:top}th{text-align:center;font-weight:bold}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.number{text-align:right;white-space:nowrap}.center{text-align:center}.summary{break-inside:avoid;page-break-inside:avoid}.totals{width:40%;margin-left:auto;margin-top:-1px}.totals th{text-align:right}.totals th{width:55%}.words{margin-top:12px}.invoice-date{text-align:right;margin-top:14px}.note{font-size:9px;margin-top:12px}.individual .identity{margin-bottom:18px}.individual .identity p{margin:9px 0}.individual .net{font-weight:bold}.individual{font-size:10px}.individual h1{font-size:16px}.individual .totals{width:40%;margin-left:60%}.individual .totals th{width:55%}.individual .note{font-size:8px}.monthly{font-size:10px}.monthly h1{font-size:16px;margin-bottom:18px}.monthly .period{margin-bottom:12px}.monthly .invoice-number{text-align:center;margin-bottom:16px}.monthly th,.monthly td{padding:3px 2px}.monthly .acts{font-size:9px;line-height:1.25}.monthly .grand-total{font-weight:bold}.monthly .number{font-variant-numeric:tabular-nums}.monthly .note{font-size:8px}.duo-page{display:flex;gap:5mm;align-items:flex-start;break-after:page;page-break-after:always}.duo-half{flex:1;min-width:0}.duo-half+.duo-half{border-left:1px dashed #999;padding-left:5mm}
/* Chaque facture du 2-par-page garde son propre en-tête, limité à sa
   demi-feuille A5 : jamais un en-tête unique étendu sur la feuille entière. */
.duo-half>.invoice-header{margin-bottom:4mm}
.fusion{font-size:10px}.fusion h1{font-size:16px}.fusion-flow{columns:2;column-gap:8mm;column-fill:auto;column-rule:1px dashed #999}
/* Facture fusionnée : l'en-tête appartient à la PREMIÈRE colonne (première
   page) ; la colonne suivante — la « 2e page » — n'en porte aucun. */
.fusion-flow>.invoice-header{margin-bottom:4mm}.fusion .identity{margin-bottom:10px}.fusion .identity p{margin:5px 0}.fusion .totals{width:62%;margin-left:38%;margin-top:6px}.fusion .totals th{width:71%}.fusion .net{font-weight:bold}.fusion .words{margin-top:8px}.fusion .note{font-size:8px}`;

function shell(number: string, kind: PrintMode, content: string, settings?: TicketSettings): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escape(number)}</title><style>${css(kind)}${INVOICE_HEADER_STYLE}</style></head><body class="${kind}">${settings ? invoiceHeaderMarkup(settings) : ''}${content}</body></html>`;
}

/** En-tête propre à UNE facture (A5 ou demi-feuille A4 du 2 par page).
 * Chaque facture porte le sien : posé une seule fois, en tête de la première
 * page ; il ne se répète ni ne s'étend sur la seconde page. */
function invoiceHeader(settings?: TicketSettings): string {
  return settings ? invoiceHeaderMarkup(settings) : '';
}

/** Pièces dans l'ordre chronologique : la plus ancienne d'abord. */
function chronological(documents: BillingDocument[]): BillingDocument[] {
  return [...documents].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number) || a.id.localeCompare(b.id));
}

/** Contenu d'une facture individuelle (commun aux impressions A5 et au
 * regroupement « 2 factures par page A4 »). patientCharge, jamais le solde.
 * `settings` n'est fourni que lorsque l'en-tête fait partie de cette facture
 * (2 par page) : dans ce cas il reste cantonné à sa demi-feuille. */
function individualContent(invoice: MonthlyInvoice, settings?: TicketSettings): string {
  const document = invoice.documents[0];
  if (!document) throw new Error('Aucune pièce individuelle à imprimer.');
  const gross = document.individualGross ?? document.total;
  const net = document.individualNet ?? document.payable;
  const reduction = Math.round((gross - net) * 100) / 100;
  // Ticket modérateur (quote-part de l'assuré) par défaut, vraie remise si la
  // société / l'assuré est réglé ainsi : le montant ne change pas, l'intitulé si.
  const libelleReduction = natureRemiseLabel(document.natureRemise);
  const payer = document.companyName || (document.category === 'societe' ? invoice.recipient : 'CLIENT COMPTOIR');
  return `
    ${invoiceHeader(settings)}<h1>FACTURE&nbsp; ${escape(invoice.number)}</h1>
    <div class="identity"><p>Date de consultation :&emsp; ${escape(dateLabel(document.consultationDate || document.date))}</p>
    <p>Nom :&emsp; <strong>${escape(document.client)}</strong></p>
    <p>Prise en charge :&emsp; ${escape(payer)}</p></div>
    <table aria-label="Articles facturés"><colgroup><col style="width:5%"><col style="width:49%"><col style="width:10%"><col style="width:18%"><col style="width:18%"></colgroup>
    <thead><tr><th>N°</th><th>Libellé Article</th><th>Qté</th><th>Prix</th><th>Montant</th></tr></thead>
    <tbody>${document.items.map((item, index) => `<tr><td class="number">${index + 1}</td><td>${escape(item.description)}</td><td class="number">${item.quantity == null ? '—' : quantite(item.quantity)}</td><td class="number">${item.unitPrice == null ? '—' : decimal(item.unitPrice)}</td><td class="number">${decimal(item.quantity != null && item.unitPrice != null ? item.quantity * item.unitPrice : item.amount)}</td></tr>`).join('') || '<tr><td colspan="5">Voir les articles sur la pièce d’origine.</td></tr>'}</tbody></table>
    <div class="summary"><table class="totals" aria-label="Totaux individuels"><tbody>
    <tr><th>Total Brut</th><td class="number">${decimal(gross)}</td></tr>
    <tr><th>${escape(libelleReduction)}</th><td class="number">${decimal(reduction)}</td></tr>
    <tr class="net"><th>Net à payer</th><td class="number">${decimal(net)}</td></tr></tbody></table>
    <p class="words">Arrêtée à la somme de : ${escape(billingAmountInWords(net, invoice.facility.currency))}</p>
    <p class="invoice-date">Date de facture :&emsp; ${escape(dateLabel(invoice.issuedAt))}</p>
    <p class="note">Montants de la pièce d’origine, avant imputation des règlements. Réimpression sans nouvel encaissement.</p></div>`;
}

function individualHtml(invoice: MonthlyInvoice, settings?: TicketSettings): string {
  return shell(invoice.number, 'individual', individualContent(invoice), settings);
}

/** Pièce individuelle → facture mensuelle factice prête à imprimer. */
function documentToInvoice(state: AppState, document: BillingDocument, printedAt: string): MonthlyInvoice {
  return { ...billingTotals([document]), id: document.id, number: document.number, sequence: 0,
    month: document.date.slice(0, 7), category: document.category, companyId: document.companyId,
    recipient: document.category === 'societe' ? document.companyName || document.client : document.client,
    documents: [document], issuedAt: printedAt, issuedBy: state.currentUser?.id || '', issuedByName: state.currentUser?.name || '',
    facility: billingFacility(state) };
}

function acts(document: BillingDocument): string {
  return groupBillingItemsByFamily(document.items)
    .map(group => `${escape(group.family)} : ${decimal(group.amount)}`).join('<br>') || 'Voir la pièce d’origine';
}

export function billingPrintHtml(invoice: MonthlyInvoice, monthly = true, settings?: TicketSettings): string {
  if (!monthly) return individualHtml(invoice, settings);
  const documents = [...invoice.documents].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const libelleParticipation = libelleReductionCommunCourt(documents.map(d => d.natureRemise));
  return shell(invoice.number, 'monthly', `
    <h1>Doit : ${escape(invoice.recipient)}</h1>
    <p class="period">Mois de prise en charge : <strong>${escape(monthLabel(invoice.month))}</strong></p>
    <p class="invoice-number">Facture N° : <strong>${escape(invoice.number)}</strong></p>
    <table aria-label="Détail de la facture société"><colgroup><col style="width:4%"><col style="width:8%"><col style="width:9%"><col style="width:28%"><col style="width:18%"><col style="width:11%"><col style="width:11%"><col style="width:11%"></colgroup>
    <thead><tr><th>N°</th><th>Date</th><th>Mlle</th><th>Nom et Prénom</th><th>Acte médicale/Prix</th><th>Montant</th><th>${escape(libelleParticipation)}</th><th>Net à Payer</th></tr></thead>
    <tbody>${documents.map((d, index) => `<tr data-source-id="${escape(d.sourceId)}" title="Facture ${escape(d.number)}"><td class="number">${index + 1}</td><td class="center">${escape(dateLabel(d.date, true))}</td><td class="center">${escape(d.matricule || d.dossier || '—')}</td><td>${escape(d.client)}${d.subCompany ? `<br>(${escape(d.subCompany)})` : ''}</td><td class="acts">${acts(d)}</td><td class="number">${decimal(d.total)}</td><td class="number">${decimal(d.copay)}</td><td class="number">${decimal(d.payable)}</td></tr>`).join('')}
    <tr class="grand-total"><td colspan="5">TOTAL (${escape(invoice.facility.currency)})</td><td class="number">${decimal(invoice.total)}</td><td class="number">${decimal(invoice.copay)}</td><td class="number">${decimal(invoice.payable)}</td></tr></tbody></table>
    <div class="summary"><p class="words">Arrêtée à la somme de : ${escape(billingAmountInWords(invoice.payable, invoice.facility.currency))}</p>
    <p class="invoice-date">Date de facture :&emsp; ${escape(dateLabel(invoice.issuedAt))}</p>
    <p class="note">Net à payer : part facturée avant règlements, et non solde restant dû. Récapitulatif sans nouvelle créance ni nouvel encaissement. Contenu et numéro conservés à la réimpression.</p></div>`, settings);
}
export function printMonthlyInvoice(invoice: MonthlyInvoice, settings?: TicketSettings): void {
  printDocument(billingPrintHtml(invoice, true, settings), `Facture mensuelle ${invoice.number}`);
}
export function individualBillingPrintHtml(state: AppState, document: BillingDocument, printedAt = new Date().toISOString()): string {
  const invoice = documentToInvoice(state, document, printedAt);
  // MÊME MISE EN PAGE QUE LE « 2 PAR PAGE » : la facture individuelle est posée
  // sur une feuille A4 PAYSAGE, cantonnée à la moitié GAUCHE (un pointillé
  // marque la découpe) — la moitié droite reste libre, même pour UNE seule
  // facture.
  return shell(invoice.number, 'duo',
    `<div class="duo-page"><div class="individual duo-half">${individualContent(invoice, state.ticketSettings)}</div><div class="duo-half" aria-hidden="true"></div></div>`);
}
export function printIndividualBillingDocument(state: AppState, document: BillingDocument): void {
  printDocument(individualBillingPrintHtml(state, document), `Facture ${document.number}`);
}

/**
 * FACTURE FUSIONNÉE : plusieurs pièces d'un même client regroupées en UNE
 * seule facture, imprimée sur A4 paysage en deux colonnes — le contenu
 * remplit la moitié gauche puis se poursuit sur la moitié droite de la même
 * feuille (la « 2e page » est juste à côté), et ainsi de suite.
 *
 * Numéro de facture : celui de la PIÈCE LA PLUS ANCIENNE des factures
 * fusionnées. Les factures d'origine ne sont plus listées (ni leur nombre, ni
 * leurs numéros, ni leurs dates) : la feuille se lit comme une seule facture
 * — en-tête en première page uniquement, puis les articles à la suite.
 */
function mergedContent(documents: BillingDocument[], clientName: string, issuedAt: string, currency: string, settings?: TicketSettings): string {
  const pieces = chronological(documents);
  const gross = Math.round(pieces.reduce((s, d) => s + (d.individualGross ?? d.total), 0) * 100) / 100;
  const net = Math.round(pieces.reduce((s, d) => s + (d.individualNet ?? d.payable), 0) * 100) / 100;
  const paid = Math.round(pieces.reduce((s, d) => s + d.paid, 0) * 100) / 100;
  const reduction = Math.round((gross - net) * 100) / 100;
  // Plusieurs pièces peuvent mêler ticket modérateur et vraie remise : dans ce
  // cas l'intitulé historique « Remise/Participation » est conservé.
  const libelleReduction = libelleReductionCommun(pieces.map(d => d.natureRemise));
  const dates = pieces.map(d => d.date).filter(Boolean).sort();
  const periode = !dates.length ? '—' : dates[0] === dates[dates.length - 1]
    ? dateLabel(dates[0])
    : `${dateLabel(dates[0])} → ${dateLabel(dates[dates.length - 1])}`;
  let numero = 0;
  const lignes = pieces.flatMap(d => d.items.map(item => {
    numero += 1;
    return `<tr><td class="number">${numero}</td><td>${escape(item.description)}</td><td class="number">${item.quantity == null ? '—' : quantite(item.quantity)}</td><td class="number">${item.unitPrice == null ? '—' : decimal(item.unitPrice)}</td><td class="number">${decimal(item.quantity != null && item.unitPrice != null ? item.quantity * item.unitPrice : item.amount)}</td></tr>`;
  })).join('') || '<tr><td colspan="5">Voir les articles sur la pièce d’origine.</td></tr>';
  // L'en-tête reste dans le FLUX de la première colonne : il coiffe la
  // première page, la colonne suivante (« 2e page ») n'en porte aucun.
  return `<div class="fusion-flow">
    ${invoiceHeader(settings)}<h1>FACTURE&nbsp; ${escape(pieces[0].number)}</h1>
    <div class="identity"><p>Nom :&emsp; <strong>${escape(clientName)}</strong></p>
    <p>Période :&emsp; ${escape(periode)}</p></div>
    <table aria-label="Articles de la facture"><colgroup><col style="width:6%"><col style="width:48%"><col style="width:10%"><col style="width:18%"><col style="width:18%"></colgroup>
    <thead><tr><th>N°</th><th>Libellé Article</th><th>Qté</th><th>Prix</th><th>Montant</th></tr></thead>
    <tbody>${lignes}</tbody></table>
    <div class="summary"><table class="totals" aria-label="Totaux fusionnés"><tbody>
    <tr><th>Total Brut</th><td class="number">${decimal(gross)}</td></tr>
    <tr><th>${escape(libelleReduction)}</th><td class="number">${decimal(reduction)}</td></tr>
    <tr class="net"><th>Net à payer</th><td class="number">${decimal(net)}</td></tr>
    <tr><th>Encaissé</th><td class="number">${decimal(paid)}</td></tr></tbody></table>
    <p class="words">Arrêtée à la somme de : ${escape(billingAmountInWords(net, currency))}</p>
    <p class="invoice-date">Date de facture :&emsp; ${escape(dateLabel(issuedAt))}</p>
    <p class="note">Facture récapitulative de ${pieces.length} pièce${pieces.length > 1 ? 's' : ''} déjà encaissée${pieces.length > 1 ? 's' : ''} — réimpression sans nouvel encaissement ni nouvelle créance. Montants des pièces d’origine, avant imputation des règlements.</p></div>
  </div>`;
}
export function mergedBillingPrintHtml(state: AppState, documents: BillingDocument[], clientName?: string, printedAt = new Date().toISOString()): string {
  if (!documents.length) throw new Error('Aucune facture sélectionnée pour la fusion.');
  const pieces = chronological(documents);
  const nom = (clientName || documents[0].client || '').trim() || 'Client';
  // Le numéro de la facture fusionnée est celui de la pièce la plus ancienne.
  return shell(pieces[0].number, 'fusion', mergedContent(documents, nom, printedAt, state.ticketSettings.currency, state.ticketSettings));
}
export function printMergedBillingDocuments(state: AppState, documents: BillingDocument[], clientName?: string): void {
  const numero = documents.length ? chronological(documents)[0].number : '';
  printDocument(mergedBillingPrintHtml(state, documents, clientName), `Facture fusionnée n° ${numero} (${documents.length} pièces)`);
}

/**
 * IMPRESSION « 2 FACTURES PAR PAGE A4 » : les factures individuelles sont
 * posées deux par deux côte à côte sur une feuille A4 paysage (chaque moitié
 * correspond à une page A5 ; un pointillé marque la découpe). Chaque facture
 * porte SON PROPRE en-tête, cantonné à sa moitié : deux en-têtes séparés par
 * feuille — jamais un en-tête unique étendu sur toute la largeur. Un en-tête
 * n'apparaît que sur la première page de la facture qu'il coiffe : si une
 * facture se poursuit sur une seconde page, celle-ci n'en reçoit aucun.
 * Les factures sont appariées dans l'ordre fourni ; un nombre impair laisse la
 * seconde moitié de la dernière feuille vide.
 */
export function twoPerPagePrintHtml(state: AppState, documents: BillingDocument[], printedAt = new Date().toISOString()): string {
  if (!documents.length) throw new Error('Aucune facture sélectionnée pour l’impression 2 par page.');
  const invoices = documents.map(document => documentToInvoice(state, document, printedAt));
  const pages: string[] = [];
  for (let i = 0; i < invoices.length; i += 2) {
    const gauche = `<div class="individual duo-half">${individualContent(invoices[i], state.ticketSettings)}</div>`;
    const droite = invoices[i + 1]
      ? `<div class="individual duo-half">${individualContent(invoices[i + 1], state.ticketSettings)}</div>`
      : '<div class="duo-half" aria-hidden="true"></div>';
    pages.push(`<div class="duo-page">${gauche}${droite}</div>`);
  }
  return shell(`Factures 2 par page A4 (${invoices.length})`, 'duo', pages.join(''));
}
export function printTwoPerPage(state: AppState, documents: BillingDocument[]): void {
  printDocument(twoPerPagePrintHtml(state, documents), `Factures 2 par page A4 (${documents.length})`);
}
