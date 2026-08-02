import type { Invoice, Patient, Company, TicketSettings } from '../types';

/** Échappe les caractères HTML réservés */
const escapeHtml = (value: string) => {
  return value.replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char)
  );
};

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
 * Génère et imprime la Facture Individuelle / Reçu Client au format officiel SALFA (A5/A4).
 */
export function printSalfaIndividualInvoice(
  settings: TicketSettings,
  invoice: Invoice,
  patient?: Patient,
  company?: Company,
) {
  const dateObj = new Date(invoice.paidAt || invoice.createdAt);
  const dateConsultation = dateObj.toLocaleDateString('fr-FR');
  const dateFacture = new Date().toLocaleDateString('fr-FR');

  const patientName = patient
    ? `${patient.lastName} ${patient.firstName}`.toUpperCase()
    : (invoice.clientName || 'CLIENT COMPTOIR').toUpperCase();

  const priseEnCharge = company?.name || patient?.company || (invoice.isExternal ? 'PAYANT DIRECT' : 'PAYANT DIRECT');

  const invNumber = (invoice as any).invoiceNumber || invoice.id.slice(0, 10).toUpperCase();

  const items = invoice.items || [];
  const totalBrut = invoice.totalAmount;
  const remise = (invoice as any).companyCoverage ? (invoice.totalAmount - invoice.patientCharge) : (invoice.totalAmount - invoice.patientCharge);
  const netAPayer = invoice.patientCharge;

  const montantLettres = numberToFrenchWords(netAPayer);

  const rowsHtml = items.map((item, idx) => {
    const qty = (item as any).quantity ?? 1;
    const unitPrice = (item as any).unitPrice ?? item.amount;
    return `
    <tr>
      <td style="text-align: center;">${idx + 1}</td>
      <td style="text-align: left; font-weight: 500;">${(item.description || '').toUpperCase()}</td>
      <td style="text-align: right;">${formatArDec(qty)}</td>
      <td style="text-align: right;">${formatArDec(unitPrice)}</td>
      <td style="text-align: right;">${formatArDec(item.amount)}</td>
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
    }
    table.invoice-table th, table.invoice-table td {
      border: 1px solid #000;
      padding: 4px 6px;
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
    }
    table.summary-table td {
      border: 1px solid #000;
      padding: 4px 6px;
    }
    table.summary-table td.lbl {
      font-weight: bold;
      text-align: right;
      background-color: #f8f8f8;
    }
    table.summary-table td.val {
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
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-container">
      <svg width="50" height="50" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="#15803d"/>
        <polygon points="50,12 61,35 85,35 66,50 73,73 50,58 27,73 34,50 15,35 39,35" fill="#ffffff"/>
        <circle cx="50" cy="48" r="14" fill="#dc2626"/>
        <path d="M50 40 L50 56 M42 48 L58 48" stroke="#ffffff" stroke-width="4"/>
      </svg>
    </div>
    <div class="header-text">
      <div class="title-lg">FIANGONANA LOTERANA MALAGASY</div>
      <div class="sub">(EGLISE LUTHERIENNE MALGACHE - MALAGASY LUTHERAN CHURCH)</div>
      <div class="title-lg" style="margin-top:3px;">SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA</div>
      <div class="sub">DEPARTEMENT DE SANTE - HEALTH DEPARTMENT</div>
      <div class="title-lg" style="margin-top:3px;">DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA</div>
      <div class="sub">NIF: 5000767080 &nbsp; STAT: 851 125 120 120 001 36</div>
      <div class="sub">E-mail: salfa.tulear@gmail.com</div>
    </div>
    ${settings.secondLogoUrl ? `<div class="logo-container"><img src="${escapeHtml(settings.secondLogoUrl)}" alt="Logo Société" /></div>` : `<div class="logo-container">
      <svg width="50" height="50" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="#003399"/>
        <path d="M50 15 L50 85 M15 50 L85 50" stroke="#ffffff" stroke-width="12"/>
        <path d="M50 35 C40 30 35 45 50 60 C65 45 60 30 50 35 Z" fill="#cc0000"/>
        <text x="50" y="92" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="bold">SALFA</text>
      </svg>
    </div>`}
  </div>

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
      <span class="info-val">${priseEnCharge}</span>
    </div>
  </div>

  <table class="invoice-table">
    <thead>
      <tr>
        <th style="width: 30px;">N</th>
        <th>Libellé Article</th>
        <th style="width: 50px;">Qté</th>
        <th style="width: 80px;">Prix</th>
        <th style="width: 90px;">Montant</th>
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
        <td class="lbl">Remise/Participat</td>
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
    <span>Page 1/1</span>
    <span>Date de facture : <strong>${dateFacture}</strong></span>
  </div>

  <script>
    window.onload = function() {
      try { window.focus(); window.print(); } catch(e){}
    }
  </script>
</body>
</html>`;

  openPrintIframe(html);
}

/**
 * Génère et imprime la Facture Récapitulative Société au format officiel SALFA (A4).
 */
export function printSalfaCompanyMonthlyInvoice(
  settings: TicketSettings,
  company: Company,
  invoices: Invoice[],
  monthYearStr: string,
  invoiceNumber: string,
  patientsList: Patient[],
) {
  const dateToday = new Date().toLocaleDateString('fr-FR');

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
        <td style="text-align: left; font-weight: bold;">${patientName}</td>
        <td style="text-align: right; font-family: monospace; font-size: 9px; line-height: 1.2;">${actDisplay}</td>
        <td style="text-align: right; font-weight: bold;">${formatArDec(montant)}</td>
        <td style="text-align: right;">${formatArDec(participat)}</td>
        <td style="text-align: right; font-weight: bold;">${formatArDec(netAPayer)}</td>
      </tr>
    `;
  }).join('');

  const montantLettres = numberToFrenchWords(totalNetGlobal);

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
  </style>
</head>
<body>
  <div class="header">
    <div class="logo-container">
      <svg width="60" height="60" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="46" fill="#15803d"/>
        <polygon points="50,12 61,35 85,35 66,50 73,73 50,58 27,73 34,50 15,35 39,35" fill="#ffffff"/>
        <circle cx="50" cy="48" r="14" fill="#dc2626"/>
        <path d="M50 40 L50 56 M42 48 L58 48" stroke="#ffffff" stroke-width="4"/>
      </svg>
    </div>
    <div class="header-text">
      <div class="title-lg">FIANGONANA LOTERANA MALAGASY</div>
      <div class="sub">(EGLISE LUTHERIENNE MALGACHE - MALAGASY LUTHERAN CHURCH)</div>
      <div class="sub" style="font-weight:bold;">SYNODAM-PARITANY FIHERENANA TOLIARA</div>
      <div class="title-lg" style="margin-top:3px;">SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA (SALFA)</div>
      <div class="sub">DEPARTEMENT DE SANTE - HEALTH DEPARTMENT</div>
      <div class="title-lg" style="margin-top:3px;">HOPITALY LOTERANA TOLIARY TANAMBAO - BP : 99 Tél : 038 34 092 61-034 50 670 90</div>
      <div class="sub">NIF: 5000767080 &nbsp; STAT: 851 125 120 120 001FIANGONANA LOTERANA MALAGASY</div>
    </div>
    ${settings.secondLogoUrl ? `<div class="logo-container"><img src="${escapeHtml(settings.secondLogoUrl)}" alt="Logo Société" /></div>` : `<div class="logo-container">
      <svg width="60" height="60" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="#003399"/>
        <path d="M50 15 L50 85 M15 50 L85 50" stroke="#ffffff" stroke-width="12"/>
        <path d="M50 35 C40 30 35 45 50 60 C65 45 60 30 50 35 Z" fill="#cc0000"/>
        <text x="50" y="92" text-anchor="middle" fill="#ffffff" font-size="12" font-weight="bold">SALFA</text>
      </svg>
    </div>`}
  </div>

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
        <th style="width: 80px;">Participat°</th>
        <th style="width: 90px;">Net à Payer</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row">
        <td colspan="5" style="text-align: right;">Total</td>
        <td style="text-align: right;">${formatArDec(totalMontantGlobal)}</td>
        <td style="text-align: right;">${formatArDec(totalParticipatGlobal)}</td>
        <td style="text-align: right;">${formatArDec(totalNetGlobal)}</td>
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

  <script>
    window.onload = function() {
      try { window.focus(); window.print(); } catch(e){}
    }
  </script>
</body>
</html>`;

  openPrintIframe(html);
}

function openPrintIframe(html: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document || iframe.contentDocument;
  if (!doc || !win) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    try {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch { /* ignore */ }
  };
  win.addEventListener?.('afterprint', cleanup);
  setTimeout(cleanup, 45000);
}
