import type { Invoice, Patient, TicketSettings, User, Prescription, LabRequest, Company, Consultation, PatientJourneyEvent, EchoRequest, HbRecord } from '../types';

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char] || char));

const money = (amount: number) => `${amount.toLocaleString('fr-FR')} Ar`;

/** Largeur et marges dépendent du format papier choisi (58 ou 80 mm). */
function paperMetrics(width: 58 | 80) {
  if (width === 58) {
    // Format étroit : 58mm, marges réduites, police plus petite
    return { width, padding: '3mm', fontSize: '9.5px', headingSize: '11px', totalSize: '11.5px', logoMaxW: '30mm', logoMaxH: '14mm', barcodeSize: '12px' };
  }
  // Format standard 80mm
  return { width, padding: '4mm', fontSize: '10.5px', headingSize: '12.5px', totalSize: '13px', logoMaxW: '45mm', logoMaxH: '18mm', barcodeSize: '15px' };
}

interface TicketBase {
  settings: TicketSettings;
  title: string;
  reference?: string;
  date?: Date;
  extraHeader?: string[]; // petites lignes sous l'en-tête
  bodyHtml: string; // corps déjà préparé
  footerNote?: string;
  signatureLabel?: string; // ex: "Signature du caissier"
  /** Si true (défaut) : lance print() sans boîte de dialogue quand le navigateur le permet */
  silent?: boolean;
}

/**
 * Script d'impression injecté dans le ticket.
 * - Appelle print() immédiatement (pas de popup de choix d'imprimante côté app).
 * - Si l'API experimental `getAttention` / kiosk n'est pas dispo, le navigateur
 *   peut encore afficher sa boîte native — on minimise le délai et on ferme l'iframe.
 * - Pour une vraie impression silencieuse : configurer l'imprimante par défaut
 *   OS + Chrome/Edge avec --kiosk-printing (documenté en admin).
 */
function printScript(silent = true) {
  if (!silent) {
    return `<script>window.onload=function(){try{window.focus();window.print();}catch(e){}}</script>`;
  }
  return `<script>
(function(){
  function doPrint(){
    try {
      window.focus();
      // Impression directe — pas de fenêtre de sélection dans l'app
      window.print();
    } catch (e) {}
  }
  if (document.readyState === 'complete') doPrint();
  else window.onload = doPrint;
})();
</script>`;
}

function buildTicketHtml(t: TicketBase) {
  const { settings, title, reference, date = new Date(), extraHeader = [], bodyHtml, footerNote, silent = true } = t;
  const m = paperMetrics(settings.paperWidth);
  const logo = (settings.showLogo !== false && settings.logoUrl)
    ? `<img class="logo" src="${escapeHtml(settings.logoUrl)}" alt="Logo" />`
    : '';
  const refLine = reference
    ? `<div class="center small">N° ${escapeHtml(reference)} · ${date.toLocaleString('fr-FR')}</div>`
    : `<div class="center small">${date.toLocaleString('fr-FR')}</div>`;
  const headerLines = [
    settings.facilityName && `<div class="bold">${escapeHtml(settings.facilityName)}</div>`,
    settings.address && `<div class="small">${escapeHtml(settings.address)}</div>`,
    settings.phone && `<div class="small">Tél. : ${escapeHtml(settings.phone)}</div>`,
    settings.nif && `<div class="small">NIF : ${escapeHtml(settings.nif)}</div>`,
    ...extraHeader.map((l) => `<div class="small">${escapeHtml(l)}</div>`),
  ].filter(Boolean).join('');
  const style = `
    @page { size: ${settings.paperWidth}mm auto; margin: 0; }
    *{box-sizing:border-box}
    body{width:${m.width}mm;margin:0;padding:${m.padding};font-family:"Courier New",monospace;font-size:${m.fontSize};line-height:1.35;color:#000}
    .center{text-align:center} .bold{font-weight:700} .small{font-size:8.5px}
    .logo{max-width:${m.logoMaxW};max-height:${m.logoMaxH};object-fit:contain;margin-bottom:2mm}
    .rule{border-top:1px dashed #000;margin:2.5mm 0}
    .rule-double{border-top:3px double #000;margin:2.5mm 0}
    table{width:100%;border-collapse:collapse} td{padding:0.8mm 0;vertical-align:top}
    .amount{text-align:right;white-space:nowrap;padding-left:1.5mm}
    .total{font-size:${m.totalSize};font-weight:bold}
    .heading{font-size:${m.headingSize};font-weight:bold}
    .barcode{letter-spacing:2px;font-size:${m.barcodeSize};margin-top:1.5mm}
    .signature{margin-top:5mm;display:flex;justify-content:space-between;gap:4mm;font-size:8.5px}
    .signature span{width:48%;border-top:1px solid #000;padding-top:1mm;text-align:center}
    .right{text-align:right}
    @media print{body{padding:${m.padding}}}
  `;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${style}</style></head><body>
    <header class="center">${logo}<div>${headerLines}</div></header>
    <div class="rule"></div>
    <div class="center heading">${escapeHtml(title)}</div>
    ${refLine}
    <div class="rule"></div>
    ${bodyHtml}
    <div class="rule-double"></div>
    <footer class="center small">${escapeHtml(footerNote || settings.footerMessage || '')}</footer>
    ${printScript(silent)}
  </body></html>`;
}

/**
 * Ouvre un ticket dans un iframe invisible et lance l'impression directement
 * (sans fenêtre de choix d'imprimante côté application).
 * Respecte settings.copies pour réimprimer N fois.
 */
function openTicketWindow(html: string, _title: string, copies = 1) {
  const n = Math.max(1, Math.min(5, copies || 1));

  const printOnce = (delayMs: number) => {
    setTimeout(() => {
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

      // Nettoyage après impression (ou timeout de sécurité)
      const cleanup = () => {
        try {
          if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
        } catch { /* ignore */ }
      };
      win.addEventListener?.('afterprint', cleanup);
      setTimeout(cleanup, 45000);
    }, delayMs);
  };

  for (let i = 0; i < n; i++) {
    printOnce(i * 800);
  }
}

/** Helper : nombre de copies depuis settings */
function ticketCopies(settings: TicketSettings): number {
  return Math.max(1, Math.min(5, settings.copies || 1));
}

/* ============================================================
 * 1) REÇU DE PAIEMENT
 * ============================================================ */
export function printPaymentTicket(
  settings: TicketSettings,
  invoice: Invoice,
  patient?: Patient,
  cashier?: User,
  company?: Company,
) {
  const date = new Date(invoice.paidAt || invoice.createdAt);
  const customer = patient
    ? `${patient.lastName} ${patient.firstName}`
    : invoice.clientName || 'Client comptoir';
  const detailRows = [
    patient?.dossier ? `<div>Dossier : ${escapeHtml(patient.dossier)}</div>` : '',
    patient?.company ? `<div>Société : ${escapeHtml(patient.company)}</div>` : '',
    company ? `<div>Société : ${escapeHtml(company.name)}</div>` : '',
    cashier ? `<div>Caissier : ${escapeHtml(cashier.name)}</div>` : '',
    invoice.isExternal ? '<div><i>Vente directe comptoir</i></div>' : '',
  ].filter(Boolean).join('');
  const itemRows = invoice.items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.description)}</td><td class="amount">${money(item.amount)}</td></tr>`,
    )
    .join('');
  const bodyHtml = `
    <div class="bold">${escapeHtml(customer)}</div>
    ${detailRows}
    <div class="rule"></div>
    <table>${itemRows}</table>
    <div class="rule"></div>
    <table>
      <tr><td>Total articles</td><td class="amount">${money(invoice.totalAmount)}</td></tr>
      <tr class="total"><td>TOTAL PAYÉ</td><td class="amount">${money(invoice.patientCharge)}</td></tr>
    </table>
    <div class="barcode center">*${escapeHtml(invoice.id.slice(0, 12).toUpperCase())}*</div>
    <div class="signature">
      <span>${escapeHtml(cashier?.name || 'Caissier')}</span>
      <span>Client</span>
    </div>
  `;
  const html = buildTicketHtml({
    settings,
    title: settings.receiptTitle || 'REÇU DE PAIEMENT',
    reference: invoice.id.slice(0, 8).toUpperCase(),
    date,
    bodyHtml,
    footerNote: settings.footerMessage,
    silent: settings.autoPrint !== false,
  });
  openTicketWindow(html, 'Reçu de paiement', ticketCopies(settings));
}

/* ============================================================
 * 2) TICKET DE FILE D'ATTENTE / ARRIVÉE
 * ============================================================ */
export function printQueueTicket(
  settings: TicketSettings,
  patient: Patient,
  queueNumber: number,
  doctor?: string,
  specialty?: string,
) {
  const date = new Date();
  const bodyHtml = `
    <div class="center" style="margin:3mm 0">
      <div class="small">Votre numéro</div>
      <div style="font-size:32px;font-weight:bold;letter-spacing:1mm;margin:2mm 0">${String(queueNumber).padStart(3, '0')}</div>
    </div>
    <div class="rule"></div>
    <div><span class="bold">Patient :</span> ${escapeHtml(patient.lastName)} ${escapeHtml(patient.firstName)}</div>
    <div><span class="bold">Dossier :</span> ${escapeHtml(patient.dossier)}</div>
    ${doctor ? `<div><span class="bold">Médecin :</span> ${escapeHtml(doctor)}</div>` : ''}
    ${specialty ? `<div><span class="bold">Spécialité :</span> ${escapeHtml(specialty)}</div>` : ''}
    <div><span class="bold">Heure :</span> ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
    <div class="rule"></div>
    <div class="center small">
      Merci de patienter en salle d'attente.<br/>
      Vous serez appelé(e) par le médecin.
    </div>
  `;
  const html = buildTicketHtml({
    settings,
    title: "TICKET DE FILE D'ATTENTE",
    reference: `Q-${String(queueNumber).padStart(4, '0')}`,
    date,
    bodyHtml,
    footerNote: "Conservez ce ticket — il sera appelé par l'équipe médicale.",
    silent: settings.autoPrint !== false,
  });
  openTicketWindow(html, "Ticket file d'attente", ticketCopies(settings));
}

/* ============================================================
 * 3) ORDONNANCE
 * ============================================================ */
export function printPrescriptionTicket(
  settings: TicketSettings,
  patient: Patient,
  doctor: User,
  date: Date,
  prescriptions: Prescription[],
  diagnosis: string,
) {
  const lines = prescriptions
    .map(
      (p, i) => `
      <tr><td colspan="2" class="bold" style="padding-top:2mm">${i + 1}. ${escapeHtml(p.articleName)} (×${p.quantity})</td></tr>
      <tr><td colspan="2" class="small">${p.posology ? `Posologie : ${escapeHtml(p.posology)}` : ''}${p.duration ? ` — Durée : ${escapeHtml(p.duration)}` : ''}</td></tr>
      <tr><td colspan="2" class="small">${p.instructions ? escapeHtml(p.instructions) : ''}</td></tr>
    `,
    )
    .join('');
  const bodyHtml = `
    <div><span class="bold">Patient :</span> ${escapeHtml(patient.lastName)} ${escapeHtml(patient.firstName)}</div>
    <div><span class="bold">Dossier :</span> ${escapeHtml(patient.dossier)}</div>
    <div><span class="bold">Âge / Sexe :</span> ${escapeHtml(patient.age)} / ${patient.gender === 'M' ? 'Masculin' : 'Féminin'}</div>
    ${patient.allergies?.length ? `<div><span class="bold">Allergies :</span> ${patient.allergies.map(escapeHtml).join(', ')}</div>` : ''}
    <div class="rule"></div>
    <div><span class="bold">Diagnostic :</span> ${escapeHtml(diagnosis || '—')}</div>
    <div class="rule"></div>
    <div class="bold heading">PRESCRIPTIONS</div>
    <table>${lines || '<tr><td><i>Aucune prescription</i></td></tr>'}</table>
    <div class="signature">
      <span>Patient</span>
      <span>${escapeHtml(doctor.name)}</span>
    </div>
  `;
  const html = buildTicketHtml({
    settings,
    title: 'ORDONNANCE MÉDICALE',
    reference: `ORD-${Date.now().toString().slice(-6)}`,
    date,
    bodyHtml,
    footerNote: 'À présenter à la pharmacie pour délivrance.',
    silent: settings.autoPrint !== false,
  });
  openTicketWindow(html, 'Ordonnance', ticketCopies(settings));
}

/* ============================================================
 * 4) BON D'ANALYSE (LABORATOIRE)
 * ============================================================ */
export function printLabRequestTicket(
  settings: TicketSettings,
  patient: Patient,
  doctor: User,
  date: Date,
  requests: LabRequest[],
) {
  const lines = requests
    .flatMap((r) => [
      `<tr><td colspan="2" class="bold" style="padding-top:1.5mm">▸ ${escapeHtml(r.examType)}${r.urgent ? ' <span style="color:#b00">[URGENT]</span>' : ''}</td></tr>`,
    ])
    .join('');
  const bodyHtml = `
    <div><span class="bold">Patient :</span> ${escapeHtml(patient.lastName)} ${escapeHtml(patient.firstName)}</div>
    <div><span class="bold">Dossier :</span> ${escapeHtml(patient.dossier)}</div>
    <div><span class="bold">Âge / Sexe :</span> ${escapeHtml(patient.age)} / ${patient.gender === 'M' ? 'M' : 'F'}</div>
    <div><span class="bold">Prescripteur :</span> ${escapeHtml(doctor.name)}</div>
    <div class="rule"></div>
    <div class="bold heading">EXAMENS DEMANDÉS</div>
    <table>${lines || '<tr><td><i>Aucun examen</i></td></tr>'}</table>
    <div class="signature">
      <span>Préleveur</span>
      <span>${escapeHtml(doctor.name)}</span>
    </div>
  `;
  const html = buildTicketHtml({
    settings,
    title: "BON D'ANALYSE — LABORATOIRE",
    reference: `LAB-${Date.now().toString().slice(-6)}`,
    date,
    bodyHtml,
    footerNote: "Présentez ce bon au laboratoire avec votre pièce d'identité.",
    silent: settings.autoPrint !== false,
  });
  openTicketWindow(html, "Bon d'analyse", ticketCopies(settings));
}


/* ============================================================
 * 4b) BON D'ÉCHOGRAPHIE
 * ============================================================ */
export function printEchoRequestTicket(
  settings: TicketSettings,
  patient: Patient,
  doctor: User,
  date: Date,
  requests: EchoRequest[],
) {
  const lines = requests
    .map(
      (r) => `
      <tr><td colspan="2" class="bold" style="padding-top:1.5mm">▸ ${escapeHtml(r.examType)}${r.urgent ? ' <span style="color:#b00">[URGENT]</span>' : ''}</td></tr>
      ${r.notes ? `<tr><td colspan="2" class="small">  ${escapeHtml(r.notes)}</td></tr>` : ''}
      ${r.price != null ? `<tr><td colspan="2" class="small">  Tarif : ${money(r.price)}</td></tr>` : ''}
    `,
    )
    .join('');
  const bodyHtml = `
    <div><span class="bold">Patient :</span> ${escapeHtml(patient.lastName)} ${escapeHtml(patient.firstName)}</div>
    <div><span class="bold">Dossier :</span> ${escapeHtml(patient.dossier)}</div>
    <div><span class="bold">Âge / Sexe :</span> ${escapeHtml(patient.age)} / ${patient.gender === 'M' ? 'M' : 'F'}</div>
    <div><span class="bold">Prescripteur :</span> ${escapeHtml(doctor.name)}</div>
    <div class="rule"></div>
    <div class="bold heading">ÉCHOGRAPHIES DEMANDÉES</div>
    <table>${lines || '<tr><td><i>Aucune échographie</i></td></tr>'}</table>
    <div class="signature">
      <span>Technicien</span>
      <span>${escapeHtml(doctor.name)}</span>
    </div>
  `;
  const html = buildTicketHtml({
    settings,
    title: "BON D'ÉCHOGRAPHIE",
    reference: `ECHO-${Date.now().toString().slice(-6)}`,
    date,
    bodyHtml,
    footerNote: "Présentez ce bon au service d'imagerie / échographie.",
    silent: settings.autoPrint !== false,
  });
  openTicketWindow(html, "Bon d'échographie", ticketCopies(settings));
}

/* ============================================================
 * 5) BON DE DÉLIVRANCE (PHARMACIE)
 * ============================================================ */
export function printDeliveryTicket(
  settings: TicketSettings,
  patient: Patient,
  date: Date,
  lines: { name: string; quantity: number; posology?: string }[],
  deliveredBy?: string,
) {
  const rows = lines
    .map(
      (l, i) => `
      <tr><td colspan="2" class="bold" style="padding-top:1.5mm">${i + 1}. ${escapeHtml(l.name)} × ${l.quantity}</td></tr>
      ${l.posology ? `<tr><td colspan="2" class="small">  ${escapeHtml(l.posology)}</td></tr>` : ''}
    `,
    )
    .join('');
  const bodyHtml = `
    <div><span class="bold">Patient :</span> ${escapeHtml(patient.lastName)} ${escapeHtml(patient.firstName)}</div>
    <div><span class="bold">Dossier :</span> ${escapeHtml(patient.dossier)}</div>
    <div class="rule"></div>
    <div class="bold heading">MÉDICAMENTS DÉLIVRÉS</div>
    <table>${rows || '<tr><td><i>Aucun médicament</i></td></tr>'}</table>
    <div class="signature">
      <span>Patient</span>
      <span>${escapeHtml(deliveredBy || 'Pharmacien')}</span>
    </div>
  `;
  const html = buildTicketHtml({
    settings,
    title: 'BON DE DÉLIVRANCE — PHARMACIE',
    reference: `PHA-${Date.now().toString().slice(-6)}`,
    date,
    bodyHtml,
    footerNote: settings.footerMessage,
    silent: settings.autoPrint !== false,
  });
  openTicketWindow(html, 'Bon de délivrance', ticketCopies(settings));
}

/* ============================================================
 * 6) CLÔTURE DE CAISSE (Z de caisse)
 * ============================================================ */
export function printClosingTicket(
  settings: TicketSettings,
  cashier: User,
  date: Date,
  sections: { title: string; rows: { label: string; value: string }[]; total?: string }[],
  grandTotal: string,
) {
  /*
   * Une imprimante thermique déroule le papier indéfiniment par défaut. Pour les
   * Z avec beaucoup de factures, nous coupons volontairement le document en pages
   * de hauteur A4 (297 mm). Les en-têtes et le total sont répétés : aucune ligne
   * n'est perdue et chaque morceau peut être contrôlé séparément.
   */
  const maxRows = settings.paperWidth === 58 ? 22 : 30;
  const pages: { title: string; rows: { label: string; value: string }[]; total?: string }[][] = [];
  let page: { title: string; rows: { label: string; value: string }[]; total?: string }[] = [];
  let rowCount = 0;
  sections.forEach((section) => {
    const rows = section.rows.length ? section.rows : [{ label: 'Aucune opération', value: '—' }];
    for (let i = 0; i < rows.length; i += maxRows) {
      const chunk = rows.slice(i, i + maxRows);
      if (rowCount && rowCount + chunk.length > maxRows) {
        pages.push(page); page = []; rowCount = 0;
      }
      page.push({ title: i ? `${section.title} (suite)` : section.title, rows: chunk, total: i + maxRows >= rows.length ? section.total : undefined });
      rowCount += chunk.length;
      if (rowCount >= maxRows) { pages.push(page); page = []; rowCount = 0; }
    }
  });
  if (page.length || !pages.length) pages.push(page);

  const width = settings.paperWidth;
  const pageHtml = pages.map((pageSections, pageIndex) => {
    const details = pageSections.map((section) => `
      <div class="section-title">${escapeHtml(section.title)}</div>
      <table>${section.rows.map((row) => `<tr><td>${escapeHtml(row.label)}</td><td class="amount">${escapeHtml(row.value)}</td></tr>`).join('')}
      ${section.total ? `<tr class="sub-total"><td>Total</td><td class="amount">${escapeHtml(section.total)}</td></tr>` : ''}</table>`).join('');
    const isLast = pageIndex === pages.length - 1;
    return `<section class="ticket-page">
      <header class="center">${settings.showLogo !== false && settings.logoUrl ? `<img class="logo" src="${escapeHtml(settings.logoUrl)}" alt="Logo" />` : ''}
        <div class="bold">${escapeHtml(settings.facilityName)}</div>
        ${settings.address ? `<div class="small">${escapeHtml(settings.address)}</div>` : ''}
        ${settings.phone ? `<div class="small">Tél. : ${escapeHtml(settings.phone)}</div>` : ''}
      </header>
      <div class="rule"></div>
      <div class="center title">CLÔTURE DE CAISSE (Z)</div>
      <div class="center small">Z-${date.toISOString().slice(0, 10).replace(/-/g, '')} · ${date.toLocaleString('fr-FR')} · Page ${pageIndex + 1}/${pages.length}</div>
      <div class="rule"></div>
      <div><b>Caissier :</b> ${escapeHtml(cashier.name)}</div>
      ${details}
      ${isLast ? `<div class="rule-double"></div><div class="grand-total"><span>TOTAL GÉNÉRAL</span><span>${escapeHtml(grandTotal)}</span></div><div class="signature"><span>Caissier</span><span>Responsable</span></div>` : '<div class="continued">Suite sur le ticket suivant…</div>'}
      <footer class="center small">Document de contrôle — à conserver.</footer>
    </section>`;
  }).join('');

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Clôture de caisse</title><style>
    @page { size: ${width}mm 297mm; margin: 0; }
    *{box-sizing:border-box} body{margin:0;font-family:"Courier New",monospace;font-size:${width === 58 ? '9.5px' : '10.5px'};line-height:1.3;color:#000}
    .ticket-page{width:${width}mm;height:297mm;padding:${width === 58 ? '3mm' : '4mm'};break-after:page;page-break-after:always;overflow:hidden;display:flex;flex-direction:column}
    .ticket-page:last-child{break-after:auto;page-break-after:auto}.center{text-align:center}.bold,.section-title{font-weight:700}.small{font-size:8.5px}.title{font-size:${width === 58 ? '11px' : '12.5px'};font-weight:700}.logo{max-width:${width === 58 ? '30mm' : '45mm'};max-height:16mm;object-fit:contain;margin-bottom:2mm}
    .rule{border-top:1px dashed #000;margin:2.5mm 0}.rule-double{border-top:3px double #000;margin:2.5mm 0}.section-title{margin-top:2.5mm}table{width:100%;border-collapse:collapse}td{padding:.8mm 0;vertical-align:top}.amount{text-align:right;white-space:nowrap;padding-left:1.5mm}.sub-total{font-weight:700}.grand-total{font-size:${width === 58 ? '11.5px' : '13px'};font-weight:700;display:flex;justify-content:space-between}.signature{margin-top:6mm;display:flex;justify-content:space-between;gap:4mm;font-size:8.5px}.signature span{width:48%;border-top:1px solid #000;padding-top:1mm;text-align:center}.continued{margin-top:auto;text-align:center;font-size:8.5px;font-style:italic}.ticket-page footer{margin-top:auto}
  </style></head><body>${pageHtml}${printScript(settings.autoPrint !== false)}</body></html>`;
  openTicketWindow(html, 'Clôture de caisse', ticketCopies(settings));
}

/* ============================================================
 * 7) COMPTE-RENDU DE RÉSULTATS — LABORATOIRE (A4)
 * ============================================================ */
export function printLabResultTicket(
  settings: TicketSettings,
  patient: Patient,
  request: LabRequest,
  doctorName?: string,
  categoryLabel?: string,
) {
  const resRows = (request.results || [])
    .map(
      (r) => `<tr>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(r.parameter)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center;font-weight:700">${r.value} ${escapeHtml(r.unit)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${r.normalMin} – ${r.normalMax} ${escapeHtml(r.unit)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center">${
          r.isAbnormal
            ? '<span style="color:#b91c1c;font-weight:700">ANORMAL</span>'
            : '<span style="color:#15803d">Normal</span>'
        }</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Compte-rendu ${escapeHtml(request.examType)}</title>
  <style>
    @page{size:A5;margin:10mm}
    body{font-family:Arial,Helvetica,sans-serif;color:#111;width:148mm;max-width:148mm;margin:0 auto;padding:0;font-size:12px;line-height:1.4}
    h1{font-size:17px;margin:0}
    .hdr{display:flex;justify-content:space-between;border-bottom:3px solid #0369a1;padding-bottom:8px;margin-bottom:12px}
    .box{border:1px solid #cbd5e1;border-radius:6px;padding:8px 12px;margin-bottom:12px}
    .title{color:#0369a1;font-weight:700}
    table{width:100%;border-collapse:collapse;margin-top:6px}
    .sig{margin-top:30px;display:flex;justify-content:space-between}
    .sig>div{width:45%;border-top:1px solid #000;padding-top:4px;text-align:center;font-size:12px}
  </style></head><body>
  <div class="hdr"><div><h1>${escapeHtml(settings.facilityName)}</h1><div>${escapeHtml(settings.address || '')}${settings.phone ? ' · ' + escapeHtml(settings.phone) : ''}</div></div>
  <div style="text-align:right"><div class="title">COMPTE-RENDU D'ANALYSE</div><div>Réf: ${escapeHtml(request.code || request.id.slice(0, 8).toUpperCase())}</div><div>${new Date(request.completedAt || Date.now()).toLocaleString('fr-FR')}</div></div></div>
  <div class="box"><strong>Patient :</strong> ${escapeHtml(patient.lastName)} ${escapeHtml(patient.firstName)} &nbsp;|&nbsp; Dossier: ${escapeHtml(patient.dossier)} &nbsp;|&nbsp; ${escapeHtml(patient.age)} / ${patient.gender === 'M' ? 'M' : 'F'}${patient.bloodGroup ? ' &nbsp;|&nbsp; Groupe: ' + escapeHtml(patient.bloodGroup) : ''}</div>
  <div class="box">
    <div class="title" style="font-size:15px;margin-bottom:4px">${escapeHtml(request.examType)} ${request.urgent ? '<span style="color:#b91c1c">[URGENT]</span>' : ''}</div>
    <div style="font-size:12px;color:#555">Catégorie: ${escapeHtml(categoryLabel || '—')} &nbsp;·&nbsp; Prélèvement: ${escapeHtml(request.sampleType || '—')} &nbsp;·&nbsp; Prescripteur: ${escapeHtml(doctorName || request.requestedBy || '—')}</div>
    <table><thead><tr style="background:#f0f9ff"><th style="text-align:left;padding:5px 8px">Paramètre</th><th style="text-align:center;padding:5px 8px">Résultat</th><th style="text-align:center;padding:5px 8px">Valeurs usuelles</th><th style="text-align:center;padding:5px 8px">Interprétation</th></tr></thead><tbody>${resRows}</tbody></table>
  </div>
  <p style="font-size:11px;color:#555">Résultats validés par le biologiste le ${new Date(request.completedAt || Date.now()).toLocaleString('fr-FR')}. Ce compte-rendu est établi sous la responsabilité du laboratoire.</p>
  <div class="sig"><div>${escapeHtml(settings.facilityName)}</div><div>${escapeHtml(request.validatedBy || request.completedBy || 'Biologiste')}</div></div>
  ${printScript(settings.autoPrint !== false)}
  </body></html>`;
  openTicketWindow(html, `Compte-rendu ${request.examType}`, ticketCopies(settings));
}

/* ============================================================
 * 8) DOSSIER MÉDICAL COMPLET (A4)
 * ============================================================ */
export function printDossierTicket(
  settings: TicketSettings,
  patient: Patient,
  payload: {
    consultations: Consultation[];
    labRequests: LabRequest[];
    invoices: Invoice[];
    journey: PatientJourneyEvent[];
  },
) {
  const { consultations, labRequests, invoices, journey } = payload;

  const consultHtml = consultations
    .slice()
    .reverse()
    .map((c) => `<div class="sec"><div class="lbl">${new Date(c.date).toLocaleDateString('fr-FR')} — ${escapeHtml(c.doctorName)}</div>
      <div><strong>Diagnostic :</strong> ${escapeHtml(c.diagnosis)}</div>
      ${c.visitReason ? `<div><strong>Motif :</strong> ${escapeHtml(c.visitReason)}</div>` : ''}
      ${c.notes ? `<div><strong>Notes :</strong> ${escapeHtml(c.notes)}</div>` : ''}
      ${c.prescriptions.length ? `<div><strong>Ordonnance :</strong> ${c.prescriptions.map((p) => `${escapeHtml(p.articleName)} ×${p.quantity}${p.posology ? ' (' + escapeHtml(p.posology) + ')' : ''}`).join(' ; ')}</div>` : ''}
    </div>`)
    .join('');

  const labHtml = labRequests
    .slice()
    .reverse()
    .map((r) => `<div class="sec"><div class="lbl">${r.completedAt ? new Date(r.completedAt).toLocaleDateString('fr-FR') : (r.requestedAt ? new Date(r.requestedAt).toLocaleDateString('fr-FR') : '—')} — ${escapeHtml(r.examType)} ${r.urgent ? '<span style="color:#b91c1c">[URGENT]</span>' : ''}</div>
      ${(r.results || [])
        .map((res) => `<div style="display:flex;justify-content:space-between;border-bottom:1px dotted #ddd;padding:1px 0"><span>${escapeHtml(res.parameter)}</span><span><strong>${res.value} ${escapeHtml(res.unit)}</strong> ${res.isAbnormal ? '<span style="color:#b91c1c;font-weight:700"> ANORMAL</span>' : ''}</span></div>`)
        .join('')}
    </div>`)
    .join('');

  const invHtml = invoices
    .slice()
    .reverse()
    .map(
      (i) => `<div style="display:flex;justify-content:space-between;border-bottom:1px dotted #ddd;padding:1px 0"><span>${i.paidAt ? new Date(i.paidAt).toLocaleDateString('fr-FR') : '—'} — ${i.status === 'paid' ? 'Payée' : 'En attente'}</span><span><strong>${i.patientCharge.toLocaleString('fr-FR')} Ar</strong></span></div>`,
    )
    .join('');

  const journeyHtml = journey
    .slice()
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map(
      (e) =>
        `<div style="display:flex;justify-content:space-between;border-bottom:1px dotted #ddd;padding:1px 0;font-size:11px"><span>${new Date(e.timestamp).toLocaleString('fr-FR')} — ${escapeHtml(e.action)}</span><span>${escapeHtml(e.department)}${e.actorName ? ' · ' + escapeHtml(e.actorName) : ''}</span></div>`,
    )
    .join('');

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Dossier médical ${escapeHtml(patient.dossier)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;max-width:820px;margin:22px auto;padding:0 24px;font-size:12px;line-height:1.45}
    h1{font-size:20px;margin:0} h2{font-size:14px;color:#0369a1;border-bottom:2px solid #0369a1;padding-bottom:3px;margin:16px 0 6px}
    .hdr{display:flex;justify-content:space-between;border-bottom:3px solid #0369a1;padding-bottom:8px;margin-bottom:10px}
    .id{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px}
    .sec{margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #eee}
    .lbl{font-weight:700;color:#0f172a}
    .tag{display:inline-block;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:4px;padding:0 6px;margin:1px;font-size:11px}
  </style></head><body>
  <div class="hdr"><div><h1>${escapeHtml(settings.facilityName)}</h1><div>${escapeHtml(settings.address || '')}${settings.phone ? ' · ' + escapeHtml(settings.phone) : ''}</div></div>
  <div style="text-align:right"><div class="title" style="color:#0369a1;font-weight:700">DOSSIER MÉDICAL</div><div>Réf: ${escapeHtml(patient.dossier)}</div><div>${new Date().toLocaleDateString('fr-FR')}</div></div></div>

  <div class="id">
    <div><strong>Nom :</strong> ${escapeHtml(patient.lastName)} ${escapeHtml(patient.firstName)}</div>
    <div><strong>Sexe :</strong> ${patient.gender === 'M' ? 'Masculin' : 'Féminin'} &nbsp; <strong>Âge :</strong> ${escapeHtml(patient.age)}</div>
    <div><strong>Dossier :</strong> ${escapeHtml(patient.dossier)}</div>
    <div><strong>Groupe sanguin :</strong> ${escapeHtml(patient.bloodGroup || '—')}</div>
    <div><strong>Naissance :</strong> ${patient.dateOfBirth !== 'N/A' ? new Date(patient.dateOfBirth).toLocaleDateString('fr-FR') : '—'}</div>
    <div><strong>Téléphone :</strong> ${escapeHtml(patient.contact || '—')}</div>
    <div><strong>Adresse :</strong> ${escapeHtml(patient.address || '—')}</div>
    <div><strong>Assuré :</strong> ${escapeHtml(patient.insureName || '—')}${patient.company ? ' (' + escapeHtml(patient.company) + ')' : ''}</div>
  </div>
  <div style="margin-top:6px">
    ${patient.allergies.length ? `<span class="tag" style="color:#b91c1c;border-color:#fecaca;background:#fef2f2">⚠ Allergies : ${escapeHtml(patient.allergies.join(', '))}</span>` : ''}
    ${patient.antecedents.length ? `<span class="tag">Antécédents : ${escapeHtml(patient.antecedents.join(', '))}</span>` : ''}
    ${patient.chronicTreatments.length ? `<span class="tag">Traitements : ${escapeHtml(patient.chronicTreatments.join(', '))}</span>` : ''}
  </div>

  <h2>PARCOURS PATIENT</h2>
  ${journeyHtml || '<div>Aucun événement.</div>'}

  <h2>HISTORIQUE DES CONSULTATIONS</h2>
  ${consultHtml || '<div>Aucune consultation.</div>'}

  <h2>BIOLOGIE — ANALYSES</h2>
  ${labHtml || '<div>Aucune analyse.</div>'}

  <h2>FACTURATION</h2>
  ${invHtml || '<div>Aucune facture.</div>'}

  ${printScript(settings.autoPrint !== false)}
  </body></html>`;
  openTicketWindow(html, `Dossier ${patient.dossier}`, ticketCopies(settings));
}

/* ============================================================
 * 9) REÇU DE PAIEMENT HOSPITALISATION / BLOC
 * ============================================================ */
export function printHbPaymentTicket(
  settings: TicketSettings,
  record: HbRecord,
  payment: { amount: number; paidBy: string; date: string },
  totalFacture: number,
  totalPaye: number,
  reste: number,
  cashier?: User,
  patient?: Patient,
) {
  const date = new Date(payment.date);
  const typeLabel = record.type === 'hospit' ? 'HOSPITALISATION' : 'BLOC OPÉRATOIRE';
  const patientName = patient
    ? `${patient.lastName} ${patient.firstName}`
    : record.patientName;
  const patientDossier = patient?.dossier || '';

  const detailRows = [
    patientDossier ? `<div>Dossier : ${escapeHtml(patientDossier)}</div>` : '',
    record.company ? `<div>Société : ${escapeHtml(record.company)}</div>` : '',
    cashier ? `<div>Caissier : ${escapeHtml(cashier.name)}</div>` : '',
    `<div>Type : ${escapeHtml(typeLabel)}</div>`,
  ].filter(Boolean).join('');

  // Lignes d'articles facturés
  const articleRows = record.lines.length > 0
    ? record.lines.map(l => {
        const lineAmt = Math.round(l.unitPrice * l.quantity * (1 - l.discount / 100));
        return `<tr><td>${escapeHtml(l.articleName)} × ${l.quantity}${l.discount > 0 ? ` (-${l.discount}%)` : ''}</td><td class="amount">${money(lineAmt)}</td></tr>`;
      }).join('')
    : '<tr><td><i>Aucun article</i></td><td class="amount">—</td></tr>';

  const bodyHtml = `
    <div class="bold">${escapeHtml(patientName)}</div>
    ${detailRows}
    <div class="rule"></div>
    <div class="bold heading">DÉTAIL FACTURE</div>
    <table>${articleRows}</table>
    <div class="rule"></div>
    <table>
      <tr><td>Total facture</td><td class="amount">${money(totalFacture)}</td></tr>
      <tr><td>Total déjà payé</td><td class="amount">${money(totalPaye - payment.amount)}</td></tr>
      <tr class="total"><td>VERSEMENT REÇU</td><td class="amount">${money(payment.amount)}</td></tr>
      <tr><td>Total payé à ce jour</td><td class="amount">${money(totalPaye)}</td></tr>
      <tr><td>Reste à payer</td><td class="amount">${money(reste)}</td></tr>
    </table>
    <div class="signature">
      <span>${escapeHtml(cashier?.name || payment.paidBy)}</span>
      <span>Client</span>
    </div>
  `;
  const html = buildTicketHtml({
    settings,
    title: `REÇU DE PAIEMENT — ${typeLabel}`,
    reference: record.id.slice(0, 8).toUpperCase(),
    date,
    bodyHtml,
    footerNote: settings.footerMessage,
    silent: settings.autoPrint !== false,
  });
  openTicketWindow(html, `Reçu paiement ${typeLabel.toLowerCase()}`, ticketCopies(settings));
}

/* ============================================================
 * Compatibilité ascendante : ancien nom d'export
 * ============================================================ */
export function printTicket(
  settings: TicketSettings,
  invoice: Invoice,
  patient?: Patient,
  cashier?: User,
) {
  printPaymentTicket(settings, invoice, patient, cashier);
}
