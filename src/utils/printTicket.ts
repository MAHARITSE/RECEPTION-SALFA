import type { Invoice, Patient, TicketSettings, User } from '../types';

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char] || char));
const money = (amount: number) => `${amount.toLocaleString('fr-FR')} Ar`;

/** Ouvre un reçu thermique 80 mm, prêt à être imprimé depuis le navigateur. */
export function printTicket(settings: TicketSettings, invoice: Invoice, patient?: Patient, cashier?: User) {
  const date = new Date(invoice.paidAt || invoice.createdAt);
  const customer = patient ? `${patient.lastName} ${patient.firstName}` : invoice.clientName || 'Client comptoir';
  const itemRows = invoice.items.map((item) => `<tr><td>${escapeHtml(item.description)}</td><td class="amount">${money(item.amount)}</td></tr>`).join('');
  const detailRows = [
    patient?.dossier ? `<div>Dossier : ${escapeHtml(patient.dossier)}</div>` : '',
    patient?.company ? `<div>Société : ${escapeHtml(patient.company)}</div>` : '',
    cashier ? `<div>Caissier : ${escapeHtml(cashier.name)}</div>` : '',
  ].join('');
  const logo = settings.logoUrl ? `<img class="logo" src="${escapeHtml(settings.logoUrl)}" alt="Logo" />` : '';
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Reçu ${escapeHtml(invoice.id.slice(0, 8).toUpperCase())}</title><style>
    @page { size: ${settings.paperWidth}mm auto; margin: 0; }
    *{box-sizing:border-box} body{width:${settings.paperWidth}mm;margin:0;padding:4mm;font-family:"Courier New",monospace;font-size:10.5px;line-height:1.35;color:#000}.center{text-align:center}.bold{font-weight:700}.small{font-size:9px}.logo{max-width:45mm;max-height:18mm;object-fit:contain;margin-bottom:2mm}.rule{border-top:1px dashed #000;margin:3mm 0}table{width:100%;border-collapse:collapse}td{padding:1mm 0;vertical-align:top}.amount{text-align:right;white-space:nowrap;padding-left:2mm}.total{font-size:13px;font-weight:bold}.barcode{letter-spacing:2px;font-size:15px;margin-top:2mm}@media print{body{padding:4mm}}
  </style></head><body>
    <header class="center">${logo}<div class="bold">${escapeHtml(settings.facilityName)}</div><div class="small">${escapeHtml(settings.address)}</div>${settings.phone ? `<div class="small">Tél. : ${escapeHtml(settings.phone)}</div>` : ''}${settings.nif ? `<div class="small">NIF : ${escapeHtml(settings.nif)}</div>` : ''}</header>
    <div class="rule"></div><div class="center bold">${escapeHtml(settings.receiptTitle)}</div><div class="center small">N° ${escapeHtml(invoice.id.slice(0, 8).toUpperCase())} · ${date.toLocaleString('fr-FR')}</div><div class="rule"></div>
    <div class="bold">${escapeHtml(customer)}</div>${detailRows}<div class="rule"></div><table>${itemRows}</table><div class="rule"></div><table><tr class="total"><td>TOTAL PAYÉ</td><td class="amount">${money(invoice.patientCharge)}</td></tr></table>
    <div class="rule"></div><footer class="center small">${escapeHtml(settings.footerMessage)}<div class="barcode">*${escapeHtml(invoice.id.slice(0, 12).toUpperCase())}*</div></footer>
    <script>window.onload=()=>{ window.focus(); ${settings.autoPrint ? 'window.print();' : ''} }<\/script>
  </body></html>`;
  const popup = window.open('', '_blank', 'width=420,height=700');
  if (!popup) { window.alert("La fenêtre d'impression a été bloquée. Autorisez les fenêtres pop-up puis réessayez."); return; }
  popup.document.write(html);
  popup.document.close();
}
