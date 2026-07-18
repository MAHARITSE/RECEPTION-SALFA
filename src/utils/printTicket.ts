import type { Invoice, Patient, TicketSettings, User, Prescription, LabRequest, HospitalizationRecord, Company } from '../types';

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
}

function buildTicketHtml(t: TicketBase) {
  const { settings, title, reference, date = new Date(), extraHeader = [], bodyHtml, footerNote } = t;
  const m = paperMetrics(settings.paperWidth);
  const logo = settings.logoUrl
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
    <script>window.onload=()=>{ window.focus(); ${settings.autoPrint ? 'window.print();' : ''} }<\\/script>
  </body></html>`;
}

function openTicketWindow(html: string, title: string) {
  const popup = window.open('', '_blank', `width=${title.includes('80') ? 480 : 360},height=720`);
  if (!popup) {
    window.alert("La fenêtre d'impression a été bloquée. Autorisez les fenêtres pop-up puis réessayez.");
    return;
  }
  popup.document.write(html);
  popup.document.close();
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
  });
  openTicketWindow(html, 'Reçu de paiement 80mm');
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
    title: 'TICKET DE FILE D\'ATTENTE',
    reference: `Q-${String(queueNumber).padStart(4, '0')}`,
    date,
    bodyHtml,
    footerNote: 'Conservez ce ticket — il sera appelé par l\'équipe médicale.',
  });
  openTicketWindow(html, 'Ticket file d\'attente');
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
  });
  openTicketWindow(html, 'Ordonnance');
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
      ...r.parameters.map((p) => `<tr><td colspan="2" class="small">  • ${escapeHtml(p)}</td></tr>`),
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
    title: 'BON D\'ANALYSE — LABORATOIRE',
    reference: `LAB-${Date.now().toString().slice(-6)}`,
    date,
    bodyHtml,
    footerNote: 'Présentez ce bon au laboratoire avec votre pièce d\'identité.',
  });
  openTicketWindow(html, 'Bon d\'analyse');
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
  });
  openTicketWindow(html, 'Bon de délivrance');
}

/* ============================================================
 * 6) BON D'HOSPITALISATION / BLOC
 * ============================================================ */
export function printHospitalizationTicket(
  settings: TicketSettings,
  patient: Patient,
  record: HospitalizationRecord,
  totalEstimate?: number,
) {
  const bodyHtml = `
    <div><span class="bold">Patient :</span> ${escapeHtml(patient.lastName)} ${escapeHtml(patient.firstName)}</div>
    <div><span class="bold">Dossier :</span> ${escapeHtml(patient.dossier)}</div>
    <div><span class="bold">Âge / Sexe :</span> ${escapeHtml(patient.age)} / ${patient.gender === 'M' ? 'M' : 'F'}</div>
    <div class="rule"></div>
    <div><span class="bold">Service :</span> ${escapeHtml(record.service)}</div>
    <div><span class="bold">Chambre :</span> ${escapeHtml(record.roomNumber)} — Lit ${escapeHtml(record.bedNumber)}</div>
    <div><span class="bold">Admission :</span> ${new Date(record.admissionDate).toLocaleString('fr-FR')}</div>
    ${record.dischargeDate ? `<div><span class="bold">Sortie :</span> ${new Date(record.dischargeDate).toLocaleString('fr-FR')}</div>` : ''}
    ${totalEstimate ? `<div><span class="bold">Estimation :</span> ${money(totalEstimate)}</div>` : ''}
    <div class="rule"></div>
    <div class="center small">
      Conservez ce bon pour la facturation lors de votre sortie.
    </div>
  `;
  const html = buildTicketHtml({
    settings,
    title: 'BON D\'HOSPITALISATION',
    reference: `HOSP-${record.id.slice(0, 6).toUpperCase()}`,
    date: new Date(),
    bodyHtml,
    footerNote: settings.footerMessage,
  });
  openTicketWindow(html, 'Bon d\'hospitalisation');
}

/* ============================================================
 * 7) CLÔTURE DE CAISSE (Z de caisse)
 * ============================================================ */
export function printClosingTicket(
  settings: TicketSettings,
  cashier: User,
  date: Date,
  sections: { title: string; rows: { label: string; value: string }[]; total?: string }[],
  grandTotal: string,
) {
  const sectionsHtml = sections
    .map(
      (s) => `
      <div class="bold" style="margin-top:2mm">${escapeHtml(s.title)}</div>
      <table>
        ${s.rows.map((r) => `<tr><td>${escapeHtml(r.label)}</td><td class="amount">${escapeHtml(r.value)}</td></tr>`).join('')}
        ${s.total ? `<tr class="total"><td>Total</td><td class="amount">${escapeHtml(s.total)}</td></tr>` : ''}
      </table>
    `,
    )
    .join('');
  const bodyHtml = `
    <div><span class="bold">Caissier :</span> ${escapeHtml(cashier.name)}</div>
    <div><span class="bold">Date :</span> ${date.toLocaleDateString('fr-FR')}</div>
    <div class="rule"></div>
    ${sectionsHtml}
    <div class="rule-double"></div>
    <div class="total" style="display:flex;justify-content:space-between">
      <span>TOTAL GÉNÉRAL</span><span>${escapeHtml(grandTotal)}</span>
    </div>
    <div class="signature">
      <span>Caissier</span>
      <span>Responsable</span>
    </div>
  `;
  const html = buildTicketHtml({
    settings,
    title: 'CLÔTURE DE CAISSE (Z)',
    reference: `Z-${date.toISOString().slice(0, 10).replace(/-/g, '')}`,
    date,
    bodyHtml,
    footerNote: 'Document de contrôle — à conserver.',
  });
  openTicketWindow(html, 'Clôture de caisse');
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
