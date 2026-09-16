import { printDocument } from './printDocument';
import { INVOICE_HEADER_STYLE, invoiceHeaderMarkup } from './invoiceHeader';
import type { Invoice, Patient, Company, TicketSettings, NatureRemise } from '../types';
import { companyNatureRemise, natureRemiseLabel, natureRemiseOuDefaut } from './natureRemise';

/** Échappe les caractères HTML réservés */
const escapeHtml = (value: unknown) => {
  return String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char)
  );
};

/** CSS des règles appliquées à l'en-tête de FACTURE personnalisé (texte + images).
 *  Les images insérées via l'éditeur sont des blocs `.entete-fig` ; une image portant
 *  la classe `.entete-bg` est positionnée en ABSOLU derrière le texte (filigrane). */
const INVOICE_HEADER_CSS = `
.header.header-custom { display: block; }
.header.header-custom .header-custom-inner {
  text-align: center; font-size: 11px; line-height: 1.45; color: #000;
  position: relative; z-index: 1;
}
.header.header-custom .header-custom-inner img {
  max-width: 92%; max-height: 70px; width: auto; height: auto; display: inline-block;
}
.header.header-custom .header-custom-inner img.invoice-header-logo-lg { max-height: 120px; }
.header.header-custom .header-custom-inner strong,
.header.header-custom .header-custom-inner b { font-weight: bold; }
/* Images normales insérées dans l'éditeur */
.header.header-custom .header-custom-inner [data-entete-fig] { position: relative; }
.header.header-custom .header-custom-inner [data-entete-fig] img {
  max-width: 150px; max-height: 100px; height: auto;
}
/* Image d'arrière-plan (filigrane) — reste derrière le texte à l'impression.
   Le z-index négatif (inline) + .header-custom-inner position:relative/z-index la
   maintiennent sous le texte mais au-dessus du fond du document. */
.header.header-custom .header-custom-inner [data-entete-fig].entete-bg {
  position: absolute !important;
}
.header.header-custom .header-custom-inner [data-entete-fig].entete-bg img {
  max-width: 100%; max-height: 170px; width: auto; height: auto; opacity: 0.25;
}
.header.header-custom .header-custom-inner [data-entete-fig].entete-sel { outline: none; }
`;

/**
 * Identité de l'établissement imprimée en tête des factures SALFA lorsque
 * l'en-tête personnalisé (Administration → En-tête Facture) n'est pas activé.
 *
 * Les factures A5 (individuelle) et A4 (société) puisent dans ces MÊMES
 * mentions : NIF, STAT et e-mail strictement identiques d'une pièce à l'autre,
 * afin qu'aucune différence d'en-tête n'apparaisse entre les documents ni entre
 * la base locale et la version déployée.
 */
const ETABLISSEMENT_SALFA = {
  eglise: 'FIANGONANA LOTERANA MALAGASY',
  egliseTraduction: '(EGLISE LUTHERIENNE MALGACHE - MALAGASY LUTHERAN CHURCH)',
  synode: 'SYNODAM-PARITANY FIHERENANA TOLIARA',
  salfa: "SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA",
  departement: 'DEPARTEMENT DE SANTE - HEALTH DEPARTMENT',
  dispensaire: 'DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA',
  hopital: 'HOPITALY LOTERANA TOLIARY TANAMBAO - BP : 99 Tél : 038 34 092 61-034 50 670 90',
  nif: '5000767080',
  stat: '851 125 120 120 001 36',
  email: 'salfa.tulear@gmail.com',
} as const;

/** Ligne NIF / STAT / e-mail commune aux factures A5 et A4. */
const mentionsLegalesSalfa = () => `      <div class="sub">NIF: ${ETABLISSEMENT_SALFA.nif} &nbsp; STAT: ${ETABLISSEMENT_SALFA.stat}</div>
      <div class="sub">E-mail: ${ETABLISSEMENT_SALFA.email}</div>`;

/**
 * Retourne l'en-tête de facture personnalisé s'il est activé et non vide,
 * sinon `null` (le document utilisera alors son en-tête par défaut intégré).
 */
function customInvoiceHeaderMarkup(settings: TicketSettings): string | null {
  if (!settings.customInvoiceHeader) return null;
  const html = (settings.invoiceHeaderHtml || '').trim();
  if (!html) return null;
  return invoiceHeaderMarkup(settings);
}

/** Convertit un nombre en toutes lettres en français pour le montant en Ariary */
export function numberToFrenchWords(n: number): string {
  if (isNaN(n) || n === 0) return 'zéro Ariary';

  const units = [
    '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'
  ];
  const tens = [
    '', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingt', 'quatre-vingt-dix'
  ];

  function convertGroup(val: number): string {
    let res = '';
    const h = Math.floor(val / 100);
    const r = val % 100;

    if (h > 0) {
      if (h === 1) res += 'cent';
      else res += units[h] + ' cent';
      if (r === 0 && h > 1) res += 's';
    }

    if (r > 0) {
      if (res) res += ' ';
      if (r < 20) {
        res += units[r];
      } else {
        const t = Math.floor(r / 10);
        const u = r % 10;
        if (t === 7) {
          res += 'soixante-' + (u === 1 ? 'et-onze' : units[10 + u]);
        } else if (t === 9) {
          res += 'quatre-vingt-' + units[10 + u];
        } else if (t === 8) {
          if (u === 0) res += 'quatre-vingts';
          else res += 'quatre-vingt-' + units[u];
        } else {
          if (u === 1 && t !== 8) res += tens[t] + ' et un';
          else if (u > 0) res += tens[t] + '-' + units[u];
          else res += tens[t];
        }
      }
    }
    return res;
  }

  const intPart = Math.floor(Math.abs(n));
  if (intPart === 0) return 'zéro Ariary';

  let remaining = intPart;
  const millions = Math.floor(remaining / 1000000);
  remaining %= 1000000;
  const thousands = Math.floor(remaining / 1000);
  const unitsGroup = remaining % 1000;

  let result = '';

  if (millions > 0) {
    if (millions === 1) result += 'un million';
    else result += convertGroup(millions) + ' millions';
  }

  if (thousands > 0) {
    if (result) result += ' ';
    if (thousands === 1) result += 'mille';
    else result += convertGroup(thousands) + ' mille';
  }

  if (unitsGroup > 0) {
    if (result) result += ' ';
    result += convertGroup(unitsGroup);
  }

  return result.trim() + ' Ariary';
}

/** Formate un nombre au format monétaire SALFA : 110 100,00 */
export function formatArDec(n: number): string {
  const parts = (n || 0).toFixed(2).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${intPart},${parts[1]}`;
}

/**
 * Construit le document de la Facture Individuelle / Reçu Client au format
 * officiel SALFA (A5/A4) — séparé de l'impression pour être vérifiable.
 *
 * L'en-tête n'est posé QU'UNE fois, en tête de la première page : il ne
 * s'étend pas et ne se répète jamais sur la deuxième page d'une facture
 * longue (les articles, eux, continuent avec les titres de colonnes).
 */
export function salfaIndividualInvoiceHtml(
  settings: TicketSettings,
  invoice: Invoice,
  patient?: Patient,
  company?: Company,
  /** Nature de la réduction résolue par l'appelant (dérogation de l'assuré comprise). */
  natureRemise?: NatureRemise,
): string {
  const dateObj = new Date(invoice.paidAt || invoice.createdAt);
  const dateConsultation = dateObj.toLocaleDateString('fr-FR');
  const dateFacture = new Date().toLocaleDateString('fr-FR');

  const patientName = patient
    ? `${patient.lastName} ${patient.firstName}`.toUpperCase()
    : (invoice.clientName || 'CLIENT COMPTOIR').toUpperCase();

  const priseEnCharge = company?.name || patient?.company || 'CLIENT COMPTOIR';

  // Médecin prescripteur (vente directe client externe) : repris sur la facture A5 quand il est connu.
  const prescriberName = (invoice.prescriberName || '').trim();

  // Numéro de facture officiel (26FA0427102 / FA-07/BSA/26-014) ; historique : invoiceNumber, puis id tronqué.
  const invNumber = invoice.numeroFacture || (invoice as any).invoiceNumber || invoice.id.slice(0, 10).toUpperCase();

  const items = invoice.items || [];
  const totalBrut = invoice.totalAmount;
  const remise = (invoice as any).companyCoverage ? (invoice.totalAmount - invoice.patientCharge) : (invoice.totalAmount - invoice.patientCharge);
  const netAPayer = invoice.patientCharge;
  // La différence brut − net est PAR DÉFAUT le ticket modérateur (quote-part de
  // l'assuré) ; pour les sociétés / assurés réglés en « remise », c'est une vraie
  // remise accordée sur le prix. Le montant reste le même, seul l'intitulé suit.
  const natureReduction = natureRemiseOuDefaut(natureRemise ?? companyNatureRemise(company));
  const libelleReduction = natureRemiseLabel(natureReduction);

  const montantLettres = numberToFrenchWords(netAPayer);

  const customHeader = customInvoiceHeaderMarkup(settings);
  const headerMarkup = customHeader ?? `  <div class="header">
    <div class="logo-container">
      <svg width="50" height="50" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="#15803d"/>
        <polygon points="50,12 61,35 85,35 66,50 73,73 50,58 27,73 34,50 15,35 39,35" fill="#ffffff"/>
        <circle cx="50" cy="48" r="14" fill="#dc2626"/>
        <path d="M50 40 L50 56 M42 48 L58 48" stroke="#ffffff" stroke-width="4"/>
      </svg>
    </div>
    <div class="header-text">
      <div class="title-lg">${ETABLISSEMENT_SALFA.eglise}</div>
      <div class="sub">${ETABLISSEMENT_SALFA.egliseTraduction}</div>
      <div class="title-lg" style="margin-top:3px;">${ETABLISSEMENT_SALFA.salfa}</div>
      <div class="sub">${ETABLISSEMENT_SALFA.departement}</div>
      <div class="title-lg" style="margin-top:3px;">${ETABLISSEMENT_SALFA.dispensaire}</div>
${mentionsLegalesSalfa()}
    </div>
    ${settings.secondLogoUrl ? `<div class="logo-container"><img src="${escapeHtml(settings.secondLogoUrl)}" alt="Logo Société" /></div>` : `<div class="logo-container">
      <svg width="50" height="50" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="#003399"/>
        <path d="M50 15 L50 85 M15 50 L85 50" stroke="#ffffff" stroke-width="12"/>
        <path d="M50 35 C40 30 35 45 50 60 C65 45 60 30 50 35 Z" fill="#cc0000"/>
        <text x="50" y="92" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="bold">SALFA</text>
      </svg>
    </div>`}
  </div>`;

  const rowsHtml = items.map((item, idx) => {
    const qty = (item as any).quantity ?? 1;
    const unitPrice = (item as any).unitPrice ?? item.amount;
    return `
    <tr>
      <td style="text-align: center;">${idx + 1}</td>
      <td style="text-align: left; font-weight: 500;">${(item.description || '').toUpperCase()}</td>
      <td class="num" style="text-align: right;">${formatArDec(qty)}</td>
      <td class="num" style="text-align: right;">${formatArDec(unitPrice)}</td>
      <td class="num" style="text-align: right;">${formatArDec(item.amount)}</td>
    </tr>
  `;
  }).join('');

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Facture ${invNumber}</title>
  <style>
    @page {
      size: A5 portrait;
      margin: 8mm;
      @bottom-left {
        content: "Page " counter(page) "/" counter(pages);
        font: 9px Arial, Helvetica, sans-serif;
        color: #000;
      }
    }
    @media print {
      body { width: 100%; margin: 0; padding: 0; }
    }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #000;
      background: #fff;
      padding: 10px;
      line-height: 1.3;
    }
    /* L'en-tête reste sur la première page : jamais de coupure à l'intérieur,
       jamais de ligne du tableau détachée juste après lui. */
    .header, .invoice-header {
      break-inside: avoid;
      page-break-inside: avoid;
      break-after: avoid;
      page-break-after: avoid;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #000;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .logo-container {
      width: 55px;
      height: 55px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-container img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .header-text {
      text-align: center;
      flex: 1;
      padding: 0 10px;
    }
    .header-text .title-lg {
      font-weight: bold;
      font-size: 11px;
      letter-spacing: 0.5px;
    }
    .header-text .sub {
      font-size: 9px;
      margin-top: 2px;
    }
    .doc-title {
      text-align: center;
      font-size: 16px;
      font-weight: bold;
      margin: 12px 0 10px 0;
      letter-spacing: 1px;
    }
    .info-block {
      margin-bottom: 12px;
      font-size: 11px;
    }
    .info-row {
      display: flex;
      margin-bottom: 4px;
    }
    .info-label {
      width: 140px;
      font-weight: normal;
    }
    .info-val {
      font-weight: bold;
    }
    table.invoice-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      font-size: 10px;
      /* Largeurs de colonnes respectées au pixel : le libellé prend le reste. */
      table-layout: fixed;
    }
    table.invoice-table th, table.invoice-table td {
      border: 1px solid #000;
      padding: 4px 6px;
      overflow-wrap: anywhere;
    }
    /* Colonnes numériques de MÊME largeur : Qté = Prix = Montant = la case des
       totaux (Total Brut / réduction / Net à payer). Les « cages » de chiffres
       du tableau et du récapitulatif ont donc exactement la même largeur et
       s'alignent verticalement sur la page A5. */
    table.invoice-table th.num, table.invoice-table td.num {
      width: 90px;
    }
    table.invoice-table th {
      font-weight: bold;
      text-align: center;
      background-color: #f8f8f8;
    }
    .summary-box {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
    }
    table.summary-table {
      border-collapse: collapse;
      width: 220px;
      font-size: 10px;
      table-layout: fixed;
    }
    table.summary-table td {
      border: 1px solid #000;
      padding: 4px 6px;
      overflow-wrap: anywhere;
    }
    table.summary-table td.lbl {
      width: 130px;
      font-weight: bold;
      text-align: right;
      background-color: #f8f8f8;
    }
    /* 90 px : la même largeur que les colonnes Qté / Prix / Montant du tableau. */
    table.summary-table td.val {
      width: 90px;
      text-align: right;
      font-weight: bold;
    }
    .words-block {
      margin-top: 15px;
      font-size: 11px;
      font-style: italic;
    }
    .footer-block {
      margin-top: 25px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
    }
    ${INVOICE_HEADER_CSS}
    ${INVOICE_HEADER_STYLE}
  </style>
</head>
<body>
  ${headerMarkup}

  <div class="doc-title">FACTURE &nbsp; ${invNumber}</div>

  <div class="info-block">
    <div class="info-row">
      <span class="info-label">Date de consultation :</span>
      <span class="info-val">${dateConsultation}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Nom :</span>
      <span class="info-val">${patientName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Prise en charge :</span>
      <span class="info-val">${escapeHtml(priseEnCharge)}</span>
    </div>
    ${prescriberName ? `<div class="info-row">
      <span class="info-label">Médecin prescripteur :</span>
      <span class="info-val">${escapeHtml(prescriberName)}</span>
    </div>` : ''}
  </div>

  <table class="invoice-table">
    <thead>
      <tr>
        <th style="width: 30px;">N</th>
        <th>Libellé Article</th>
        <th class="num">Qté</th>
        <th class="num">Prix</th>
        <th class="num">Montant</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="summary-box">
    <table class="summary-table">
      <tr>
        <td class="lbl">Total Brut</td>
        <td class="val">${formatArDec(totalBrut)}</td>
      </tr>
      <tr>
        <td class="lbl">${escapeHtml(libelleReduction)}</td>
        <td class="val">${formatArDec(remise)}</td>
      </tr>
      <tr>
        <td class="lbl">Net à payer</td>
        <td class="val">${formatArDec(netAPayer)}</td>
      </tr>
    </table>
  </div>

  <div class="words-block">
    Arrêtez à la somme de : <strong>${montantLettres}</strong>
  </div>

  <div class="footer-block">
    <span>Date de facture : <strong>${dateFacture}</strong></span>
  </div>

</body>
</html>`;

  return html;
}

/** Imprime la Facture Individuelle / Reçu Client (A5) via la file d'impression. */
export function printSalfaIndividualInvoice(
  settings: TicketSettings,
  invoice: Invoice,
  patient?: Patient,
  company?: Company,
  natureRemise?: NatureRemise,
): void {
  printDocument(salfaIndividualInvoiceHtml(settings, invoice, patient, company, natureRemise), 'Facture individuelle SALFA');
}

/**
 * Construit le document de la Facture Récapitulative Société au format officiel
 * SALFA (A4) — séparé de l'impression pour être vérifiable. Comme pour la facture
 * individuelle, l'en-tête coiffe la seule première page : une facture société
 * longue ne le répète pas sur les pages suivantes.
 */
export function salfaCompanyMonthlyInvoiceHtml(
  settings: TicketSettings,
  company: Company,
  invoices: Invoice[],
  monthYearStr: string,
  invoiceNumber: string,
  patientsList: Patient[],
) {
  const dateToday = new Date().toLocaleDateString('fr-FR');
  // Colonne « Participat° » = ticket modérateur, sauf société réglée en remise.
  const estRemise = companyNatureRemise(company) === 'remise';
  const libelleParticipation = estRemise ? 'Remise' : 'Participat°';

  let totalMontantGlobal = 0;
  let totalParticipatGlobal = 0;
  let totalNetGlobal = 0;

  const rowsHtml = invoices.map((inv, idx) => {
    const pt = patientsList.find(p => p.id === inv.patientId);
    const dateInv = new Date(inv.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const matricule = pt?.dossier || pt?.insureName || '';
    const patientName = pt ? `${pt.lastName} ${pt.firstName}`.toUpperCase() : (inv.clientName || '').toUpperCase();

    let consAmt = 0;
    let medicAmt = 0;
    let laboAmt = 0;
    let soinsAmt = 0;

    (inv.items || []).forEach(it => {
      const desc = (it.description || '').toUpperCase();
      if (desc.includes('CONSULTATION') || desc.startsWith('CONS')) {
        consAmt += it.amount;
      } else if (desc.includes('ANALYSE') || desc.includes('LABO') || desc.includes('EXAMEN') || desc.includes('NFS') || desc.includes('BIO')) {
        laboAmt += it.amount;
      } else if (desc.includes('SOIN') || desc.includes('INJECTION') || desc.includes('PANSEMENT')) {
        soinsAmt += it.amount;
      } else {
        medicAmt += it.amount;
      }
    });

    const actsParts: string[] = [];
    if (consAmt > 0) actsParts.push(`CONS : ${formatArDec(consAmt)}`);
    if (medicAmt > 0) actsParts.push(`MEDIC : ${formatArDec(medicAmt)}`);
    if (laboAmt > 0) actsParts.push(`LABO : ${formatArDec(laboAmt)}`);
    if (soinsAmt > 0) actsParts.push(`SOINS : ${formatArDec(soinsAmt)}`);

    const actDisplay = actsParts.length > 0 ? actsParts.join('<br>') : `MEDIC : ${formatArDec(inv.totalAmount)}`;

    const montant = inv.totalAmount;
    const netAPayer = (inv as any).companyCoverage ? (inv as any).companyCoverage : inv.totalAmount;
    const participat = montant > netAPayer ? (montant - netAPayer) : 0;

    totalMontantGlobal += montant;
    totalParticipatGlobal += participat;
    totalNetGlobal += netAPayer;

    return `
      <tr>
        <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
        <td style="text-align: center;">${dateInv}</td>
        <td style="text-align: center;">${matricule}</td>
        <td style="text-align: center; font-weight: bold;">${patientName}</td>
        <td style="text-align: center; font-family: monospace; font-size: 9px; line-height: 1.2;">${actDisplay}</td>
        <td style="text-align: center; font-weight: bold;">${formatArDec(montant)}</td>
        <td style="text-align: center;">${formatArDec(participat)}</td>
        <td style="text-align: center; font-weight: bold;">${formatArDec(netAPayer)}</td>
      </tr>
    `;
  }).join('');

  const montantLettres = numberToFrenchWords(totalNetGlobal);

  const customHeader = customInvoiceHeaderMarkup(settings);
  const headerMarkup = customHeader ?? `  <div class="header">
    <div class="logo-container">
      <svg width="60" height="60" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="#15803d"/>
        <polygon points="50,12 61,35 85,35 66,50 73,73 50,58 27,73 34,50 15,35 39,35" fill="#ffffff"/>
        <circle cx="50" cy="48" r="14" fill="#dc2626"/>
        <path d="M50 40 L50 56 M42 48 L58 48" stroke="#ffffff" stroke-width="4"/>
      </svg>
    </div>
    <div class="header-text">
      <div class="title-lg">${ETABLISSEMENT_SALFA.eglise}</div>
      <div class="sub">${ETABLISSEMENT_SALFA.egliseTraduction}</div>
      <div class="sub" style="font-weight:bold;">${ETABLISSEMENT_SALFA.synode}</div>
      <div class="title-lg" style="margin-top:3px;">${ETABLISSEMENT_SALFA.salfa} (SALFA)</div>
      <div class="sub">${ETABLISSEMENT_SALFA.departement}</div>
      <div class="title-lg" style="margin-top:3px;">${ETABLISSEMENT_SALFA.hopital}</div>
${mentionsLegalesSalfa()}
    </div>
    ${settings.secondLogoUrl ? `<div class="logo-container"><img src="${escapeHtml(settings.secondLogoUrl)}" alt="Logo Société" /></div>` : `<div class="logo-container">
      <svg width="60" height="60" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="#003399"/>
        <path d="M50 15 L50 85 M15 50 L85 50" stroke="#ffffff" stroke-width="12"/>
        <path d="M50 35 C40 30 35 45 50 60 C65 45 60 30 50 35 Z" fill="#cc0000"/>
        <text x="50" y="92" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="bold">SALFA</text>
      </svg>
    </div>`}
  </div>`;

  const html = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Facture Société ${company.name}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #000;
      background: #fff;
      padding: 10px;
      line-height: 1.35;
    }
    /* En-tête de la première page uniquement : jamais étendu ni répété sur la
       deuxième page d'une facture société longue. */
    .header, .invoice-header {
      break-inside: avoid;
      page-break-inside: avoid;
      break-after: avoid;
      page-break-after: avoid;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #000;
      padding-bottom: 6px;
      margin-bottom: 15px;
    }
    .logo-container {
      width: 65px;
      height: 65px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .logo-container img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .header-text {
      text-align: center;
      flex: 1;
      padding: 0 10px;
    }
    .header-text .title-lg {
      font-weight: bold;
      font-size: 11.5px;
    }
    .header-text .sub {
      font-size: 9.5px;
      margin-top: 2px;
    }
    .title-block {
      text-align: center;
      margin: 15px 0;
    }
    .doit-title {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 8px;
    }
    .month-title {
      font-size: 13px;
      font-weight: bold;
      margin-bottom: 6px;
    }
    .facture-num {
      font-size: 13px;
      font-weight: bold;
    }
    table.company-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
      font-size: 10px;
    }
    table.company-table th, table.company-table td {
      border: 1px solid #000;
      padding: 5px 6px;
    }
    table.company-table th {
      font-weight: bold;
      text-align: center;
      background-color: #f5f5f5;
    }
    table.company-table tr.total-row td {
      font-weight: bold;
      background-color: #f5f5f5;
      font-size: 11px;
    }
    .bottom-words {
      margin-top: 20px;
      font-size: 12px;
    }
    .bottom-signatures {
      margin-top: 25px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 11px;
    }
    .rib-block {
      font-weight: bold;
      font-size: 12px;
    }
    .gest-block {
      text-align: right;
    }
    .gest-title {
      text-decoration: underline;
      font-weight: bold;
      margin-top: 10px;
    }
    ${INVOICE_HEADER_CSS}
    ${INVOICE_HEADER_STYLE}
  </style>
</head>
<body>
  ${headerMarkup}

  <div class="title-block">
    <div class="doit-title">Doit : ${company.name.toUpperCase()}</div>
    <div class="month-title">Mois de prise en charge : ${monthYearStr}</div>
    <div class="facture-num">Facture N° : ${invoiceNumber}</div>
  </div>

  <table class="company-table">
    <thead>
      <tr>
        <th style="width: 30px;">N°</th>
        <th style="width: 65px;">Date</th>
        <th style="width: 60px;">Mlle</th>
        <th>Nom et Prénom</th>
        <th style="width: 140px;">Acte médicale/Prix</th>
        <th style="width: 90px;">Montant</th>
        <th style="width: 90px;">${escapeHtml(libelleParticipation)}</th>
        <th style="width: 90px;">Net à Payer</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row">
        <td colspan="5" style="text-align: center;">Total</td>
        <td style="text-align: center;">${formatArDec(totalMontantGlobal)}</td>
        <td style="text-align: center;">${formatArDec(totalParticipatGlobal)}</td>
        <td style="text-align: center;">${formatArDec(totalNetGlobal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="bottom-words">
    Arrêtez à la somme de : <strong>${montantLettres}</strong>
  </div>

  <div class="bottom-signatures">
    <div class="rib-block">
      RIB : 00005-00041-43200100200-85
    </div>
    <div class="gest-block">
      <div>Toliara le, ${dateToday}</div>
      <div class="gest-title">Gestionnaire</div>
    </div>
  </div>

</body>
</html>`;

  return html;
}

/** Imprime la Facture Récapitulative Société (A4) via la file d'impression. */
export function printSalfaCompanyMonthlyInvoice(
  settings: TicketSettings,
  company: Company,
  invoices: Invoice[],
  monthYearStr: string,
  invoiceNumber: string,
  patientsList: Patient[],
): void {
  printDocument(
    salfaCompanyMonthlyInvoiceHtml(settings, company, invoices, monthYearStr, invoiceNumber, patientsList),
    'Facture récapitulative société SALFA',
  );
}
