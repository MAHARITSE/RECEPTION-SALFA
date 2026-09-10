import type { AppState } from '../../store';
import type { TicketSettings } from '../../types';
import { INVOICE_HEADER_STYLE, invoiceHeaderMarkup } from '../../utils/invoiceHeader';
import { printDocument } from '../../utils/printDocument';
import { groupBillingItemsByFamily } from './billingFamilies';
import { billingFacility, localBillingDate, billingTotals, type BillingDocument, type MonthlyInvoice } from './monthlyBilling';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const decimal = (value: number) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
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
const css = (monthly: boolean) => `@page{size:${monthly ? 'A4' : 'A5'} portrait;margin:${monthly ? '12mm 10mm 16mm' : '8mm 7mm 12mm'};@bottom-left{content:"Page " counter(page) "/" counter(pages);font:9px Arial,sans-serif;color:#000}}
*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#000;background:#fff;margin:0}h1{font-size:19px;text-align:center;margin:8px 0 14px}p{margin:8px 0}table{font:inherit;width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #000;padding:4px;overflow-wrap:anywhere;vertical-align:top}th{text-align:center;font-weight:bold}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.number{text-align:right;white-space:nowrap}.center{text-align:center}.summary{break-inside:avoid;page-break-inside:avoid}.totals{width:40%;margin-left:auto;margin-top:-1px}.totals th{text-align:right}.totals th{width:62%}.words{margin-top:12px}.invoice-date{text-align:right;margin-top:14px}.note{font-size:9px;margin-top:12px}.individual .identity{margin-bottom:18px}.individual .identity p{margin:9px 0}.individual .net{font-weight:bold}.individual{font-size:10px}.individual h1{font-size:16px}.individual .totals{width:48%}.individual .totals th{width:62%}.individual .note{font-size:8px}.monthly{font-size:10px}.monthly h1{font-size:16px;margin-bottom:18px}.monthly .period{margin-bottom:12px}.monthly .invoice-number{text-align:center;margin-bottom:16px}.monthly th,.monthly td{padding:3px 2px}.monthly .acts{font-size:9px;line-height:1.25}.monthly .grand-total{font-weight:bold}.monthly .number{font-variant-numeric:tabular-nums}.monthly .note{font-size:8px}`;

function shell(number: string, kind: string, content: string, settings?: TicketSettings): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escape(number)}</title><style>${css(kind === 'monthly')}${INVOICE_HEADER_STYLE}</style></head><body class="${kind}">${settings ? invoiceHeaderMarkup(settings) : ''}${content}</body></html>`;
}

/** Native individual receipts keep patientCharge, not the insurer's payable or balance.
 * Manual assurance pieces without this field use their recorded net instead. */
function individualHtml(invoice: MonthlyInvoice, settings?: TicketSettings): string {
  const document = invoice.documents[0];
  if (!document) throw new Error('Aucune pièce individuelle à imprimer.');
  const gross = document.individualGross ?? document.total;
  const net = document.individualNet ?? document.payable;
  const reduction = Math.round((gross - net) * 100) / 100;
  const payer = document.companyName || (document.category === 'societe' ? invoice.recipient : 'PAYANT DIRECT');
  return shell(invoice.number, 'individual', `
    <h1>FACTURE&nbsp; ${escape(invoice.number)}</h1>
    <div class="identity"><p>Date de consultation :&emsp; ${escape(dateLabel(document.consultationDate || document.date))}</p>
    <p>Nom :&emsp; <strong>${escape(document.client)}</strong></p>
    <p>Prise en charge :&emsp; ${escape(payer)}</p></div>
    <table aria-label="Articles facturés"><colgroup><col style="width:5%"><col style="width:55%"><col style="width:8%"><col style="width:14%"><col style="width:18%"></colgroup>
    <thead><tr><th>N°</th><th>Libellé Article</th><th>Qté</th><th>Prix</th><th>Montant</th></tr></thead>
    <tbody>${document.items.map((item, index) => `<tr><td class="number">${index + 1}</td><td>${escape(item.description)}</td><td class="number">${item.quantity == null ? '—' : decimal(item.quantity)}</td><td class="number">${item.unitPrice == null ? '—' : decimal(item.unitPrice)}</td><td class="number">${decimal(item.quantity != null && item.unitPrice != null ? item.quantity * item.unitPrice : item.amount)}</td></tr>`).join('') || '<tr><td colspan="5">Voir les articles sur la pièce d’origine.</td></tr>'}</tbody></table>
    <div class="summary"><table class="totals" aria-label="Totaux individuels"><tbody>
    <tr><th>Total Brut</th><td class="number">${decimal(gross)}</td></tr>
    <tr><th>Remise/Participation</th><td class="number">${decimal(reduction)}</td></tr>
    <tr class="net"><th>Net à payer</th><td class="number">${decimal(net)}</td></tr></tbody></table>
    <p class="words">Arrêtée à la somme de : ${escape(billingAmountInWords(net, invoice.facility.currency))}</p>
    <p class="invoice-date">Date de facture :&emsp; ${escape(dateLabel(invoice.issuedAt))}</p>
    <p class="note">Montants de la pièce d’origine, avant imputation des règlements. Réimpression sans nouvel encaissement.</p></div>`, settings);
}

function acts(document: BillingDocument): string {
  return groupBillingItemsByFamily(document.items)
    .map(group => `${escape(group.family)} : ${decimal(group.amount)}`).join('<br>') || 'Voir la pièce d’origine';
}

export function billingPrintHtml(invoice: MonthlyInvoice, monthly = true, settings?: TicketSettings): string {
  if (!monthly) return individualHtml(invoice, settings);
  const documents = [...invoice.documents].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return shell(invoice.number, 'monthly', `
    <h1>Doit : ${escape(invoice.recipient)}</h1>
    <p class="period">Mois de prise en charge : <strong>${escape(monthLabel(invoice.month))}</strong></p>
    <p class="invoice-number">Facture N° : <strong>${escape(invoice.number)}</strong></p>
    <table aria-label="Détail de la facture société"><colgroup><col style="width:4%"><col style="width:8%"><col style="width:9%"><col style="width:28%"><col style="width:18%"><col style="width:11%"><col style="width:11%"><col style="width:11%"></colgroup>
    <thead><tr><th>N°</th><th>Date</th><th>Mlle</th><th>Nom et Prénom</th><th>Acte médicale/Prix</th><th>Montant</th><th>Participat°</th><th>Net à Payer</th></tr></thead>
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
  const invoice: MonthlyInvoice = { ...billingTotals([document]), id: document.id, number: document.number, sequence: 0,
    month: document.date.slice(0, 7), category: document.category, companyId: document.companyId,
    recipient: document.category === 'societe' ? document.companyName || document.client : document.client,
    documents: [document], issuedAt: printedAt, issuedBy: state.currentUser?.id || '', issuedByName: state.currentUser?.name || '',
    facility: billingFacility(state) };
  return billingPrintHtml(invoice, false, state.ticketSettings);
}
export function printIndividualBillingDocument(state: AppState, document: BillingDocument): void {
  printDocument(individualBillingPrintHtml(state, document), `Facture ${document.number}`);
}
