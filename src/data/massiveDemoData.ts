/**
 * Jeu de démonstration synthétique, déterministe et sans données personnelles réelles.
 *
 * Règle métier appliquée dans les données de démonstration : aucune consultation
 * impayée ne contient de lignes de prescription affichables. Les prescriptions
 * présentes ici sont toutes rattachées à une facture de pharmacie payée.
 */
import type { AppState } from '../store';
import type {
  Article,
  Company,
  Consultation,
  Invoice,
  LabExamCatalog,
  Patient,
  Prescription,
  User,
  Vente,
  VenteLine,
  VentePayment,
} from '../types';

const DAY = 86_400_000;
const END = Date.UTC(2026, 6, 21, 12); // référence fixe pour une démo reproductible
let seed = 0x51af1a;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const iso = (offset: number) => new Date(END - offset * DAY).toISOString();
const id = (kind: string, n: number) => `${kind}-${String(n).padStart(6, '0')}`;

const firstNames = [
  'Aina', 'Hery', 'Miora', 'Tiana', 'Feno', 'Soa', 'Lanto', 'Niry', 'Voahirana', 'Tahina',
  'Rija', 'Mamy', 'Nomena', 'Kanto', 'Fara', 'Tsiry', 'Mialy', 'Hanitra', 'Tovo', 'Sitraka',
  'Lova', 'Mendrika', 'Ravaka', 'Tendry', 'Aro', 'Lina', 'Nivo', 'Sanda', 'Faniry', 'Hasina',
];
const lastNames = [
  'Rakoto', 'Rasoa', 'Andriamanantena', 'Ravelomanana', 'Randrianasolo', 'Rabetsara',
  'Raharison', 'Razanakoto', 'Rakotomalala', 'Rasoazanany', 'Andriatsilavo', 'Ravelotiana',
  'Benali', 'Diallo', 'Moreau', 'Nguyen', 'Khan', 'Santos', 'Muller', 'Rossi', 'Martin', 'Kumar',
];
const towns = ['Antananarivo', 'Toamasina', 'Mahajanga', 'Antsirabe', 'Fianarantsoa', 'Morondava'];

const companies: Company[] = [
  ['company-000001', 'Orion Santé Services', 'monthly_global'],
  ['company-000002', 'Baobab Logistique', 'per_invoice'],
  ['company-000003', 'Vahana Technologies', 'monthly_global'],
  ['company-000004', 'Mada Horizon Mining', 'per_invoice'],
  ['company-000005', 'Tropic Textile', 'monthly_global'],
  ['company-000006', 'Asteria Banque', 'per_invoice'],
].map(([cid, name, settlementMode]) => ({
  id: cid,
  name,
  paymentMode: 'Crédit' as const,
  settlementMode: settlementMode as Company['settlementMode'],
  createdAt: iso(720),
}));

const users: User[] = [
  ['USR-ADMIN', 'Admin Démonstration', 'admin', 'admin123'],
  ['USR-REC', 'Aina Rakoto', 'receptionist', 'rec123'],
  ['USR-DOC', 'Dr. Feno Rasoana', 'doctor', 'doc123'],
  ['USR-DOC2', 'Dr. Mialy Andria', 'doctor', 'doc123'],
  ['USR-CASH', 'Miora Kanto', 'cashier', 'caisse123'],
  ['USR-PHA', 'Tiana Soa', 'pharmacy', 'pharma123'],
  ['USR-LAB', 'Hery Lanto', 'laboratory', 'labo123'],
  ['USR-MAG', 'Niry Tahina', 'magasinier', 'mag123'],
  ['USR-BIL', 'Lova Sitraka', 'billing', 'fact123'],
].map(([uid, name, role, password]) => ({ id: uid, name, role: role as User['role'], password }));

const articleSeeds = [
  ['Paracétamol 500 mg', 'MEDIC', 'comprimé'],
  ['Amoxicilline 500 mg', 'MEDIC', 'gélule'],
  ['Ibuprofène 400 mg', 'MEDIC', 'comprimé'],
  ['Oméprazole 20 mg', 'MEDIC', 'gélule'],
  ['Metformine 850 mg', 'MEDIC', 'comprimé'],
  ['Amlodipine 5 mg', 'MEDIC', 'comprimé'],
  ['Ceftriaxone 1 g', 'MEDIC', 'flacon'],
  ['Vitamine C 500 mg', 'MEDIC', 'comprimé'],
  ['Tube EDTA', 'LABO', 'unité'],
  ['Réactif glycémie', 'LABO', 'flacon'],
  ['Bandelette urinaire', 'LABO', 'boîte'],
  ['Gel échographie', 'ECHO', 'flacon'],
  ['Papier thermique', 'ECHO', 'rouleau'],
  ['Composite dentaire', 'DENT', 'seringue'],
  ['Anesthésique dentaire', 'DENT', 'cartouche'],
  ['Compresses stériles', 'MEDIC', 'boîte'],
] as const;

const articles: Article[] = articleSeeds.map(([name, family, unit], i) => ({
  id: id('art', i),
  name,
  family,
  unit,
  barcode: `619${String(100000000 + i)}`,
  priceComptoir: 800 + (i + 1) * 600,
  priceSociete: 700 + (i + 1) * 520,
  priceExterne: 1000 + (i + 1) * 700,
  purchasePrice: 350 + (i + 1) * 280,
  stockCentral: 900 + i * 61,
  stockPharmacie: 140 + i * 11,
  minStockCentral: 80,
  minStockPharmacie: 25,
  supplier: `Fournisseur Démo ${i % 8 + 1}`,
  expiryDate: '2027-12-31',
}));

const labCatalog: LabExamCatalog[] = [
  ['LAB001', 'NFS', 'hematologie', ['Globules Rouges', 'Globules Blancs', 'Hémoglobine', 'Plaquettes'], 15000],
  ['LAB002', 'Glycémie à jeun', 'biochimie', ['Glucose'], 9000],
  ['LAB003', 'Créatinine', 'biochimie', ['Créatinine'], 10000],
  ['LAB004', 'CRP', 'biochimie', ['CRP'], 8000],
  ['LAB005', 'ECBU', 'bacteriologie', ['Culture'], 18000],
  ['LAB006', 'Goutte épaisse', 'parasitologie', ['Plasmodium'], 12000],
].map(([code, name, category, parameters, price], i) => ({
  id: id('exam', i),
  code: code as string,
  name: name as string,
  category: category as LabExamCatalog['category'],
  parameters: parameters as string[],
  sampleType: 'Sang veineux',
  priceComptoir: price as number,
  priceSociete: Math.round((price as number) * 0.88),
  priceExterne: Math.round((price as number) * 1.18),
  urgentPrice: Math.round((price as number) * 1.55),
  durationHours: 4 + i,
}));

const prescriptionAmount = (p: Prescription) => Math.round(p.unitPrice * p.quantity * (1 - p.discount / 100));
const invoiceAmount = (items: Invoice['items']) => items.reduce((sum, item) => sum + item.amount, 0);

function isoMonthDay(monthOffset: number, day: number, hour: number): string {
  const d = new Date(END);
  d.setUTCMonth(d.getUTCMonth() - monthOffset);
  d.setUTCDate(Math.min(day, 28));
  d.setUTCHours(hour, Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);
  return d.toISOString();
}

export function createMassiveDemoState(): AppState {
  seed = 0x51af1a;

  const patients: Patient[] = [];
  const consultations: Consultation[] = [];
  const invoices: Invoice[] = [];
  const ventes: Vente[] = [];
  const venteLines: VenteLine[] = [];
  const ventePayments: VentePayment[] = [];
  const labRequests: AppState['labRequests'] = [];
  const journey: AppState['journey'] = [];
  const pharmaDeliveryItems: AppState['pharmaDeliveryItems'] = [];

  const PATIENT_COUNT = 48;
  const MONTHS = 12;
  const VISITS_PER_MONTH = 2;

  for (let n = 0; n < PATIENT_COUNT; n++) {
    const company = n % 5 === 0 ? companies[n % companies.length] : undefined;
    const patient: Patient = {
      id: id('pat', n),
      dossier: `DOS-${String(260000 + n)}`,
      matricule: company ? `MAT-${company.id.slice(-3)}-${String(n).padStart(4, '0')}` : undefined,
      firstName: firstNames[n % firstNames.length],
      lastName: `${lastNames[n % lastNames.length]}-${String(n + 1).padStart(2, '0')}`,
      dateOfBirth: `${1948 + (n % 55)}-${String(1 + n % 12).padStart(2, '0')}-${String(1 + n % 27).padStart(2, '0')}`,
      age: `${18 + n % 70} Ans`,
      gender: n % 2 ? 'F' : 'M',
      address: `Lot ${100 + n}, ${pick(towns)}`,
      contact: `03${2 + n % 6} ${String(10000000 + n).slice(0, 2)} ${String(10000000 + n).slice(2, 5)} ${String(10000000 + n).slice(5)}`,
      ssn: `SYN-${String(900000000 + n)}`,
      insureName: company?.name,
      clientType: company ? 'societe' : 'comptoir',
      company: company?.name,
      allergies: n % 11 === 0 ? ['Pénicilline'] : [],
      chronicTreatments: n % 9 === 0 ? ['Traitement chronique synthétique'] : [],
      antecedents: n % 8 === 0 ? ['Antécédent déclaré'] : [],
      bloodGroup: pick(['A+', 'B+', 'O+', 'AB+']),
      vitalSigns: undefined,
      registeredAt: isoMonthDay(MONTHS + 1, 1 + n % 27, 8),
      registeredBy: 'Aina Rakoto',
      status: 'completed',
      lastVisitAt: iso(1),
    };
    patients.push(patient);

    journey.push({
      id: id('journey', n),
      patientId: patient.id,
      timestamp: patient.registeredAt,
      department: 'reception',
      action: 'Enregistrement patient',
      status: 'registered',
      actorName: 'Aina Rakoto',
    });

    let lastStatus: Patient['status'] = 'completed';
    let lastVisitAt = patient.registeredAt;

    for (let m = 0; m < MONTHS; m++) {
      for (let v = 0; v < VISITS_PER_MONTH; v++) {
        const k = consultations.length;
        const date = isoMonthDay(MONTHS - 1 - m, 6 + v * 13 + Math.floor(rnd() * 4), 7 + Math.floor(rnd() * 10));
        const consultId = id('consult', k);
        const doctorId = k % 3 === 0 ? 'USR-DOC2' : 'USR-DOC';
        const doctorName = users.find(u => u.id === doctorId)?.name || 'Médecin Démo';
        const invoicePaid = k % 7 !== 0;
        // Important : une prescription n'est créée que si la partie pharmacie est payée.
        const hasPaidPrescription = invoicePaid && k % 2 === 0;
        const article = articles[k % 8];
        const delivered = hasPaidPrescription && k % 5 !== 0;
        const prescriptions: Prescription[] = hasPaidPrescription ? [{
          id: id('presc', k),
          articleId: article.id,
          articleName: article.name,
          quantity: 1 + (k % 3),
          posology: pick(['1 unité matin et soir', '1 unité après repas', 'Selon symptômes']),
          duration: `${3 + k % 7} jours`,
          instructions: 'Donnée synthétique payée.',
          unitPrice: patient.clientType === 'societe' ? article.priceSociete : article.priceComptoir,
          discount: k % 10 === 0 ? 5 : 0,
          delivered,
        }] : [];

        const labExam = k % 4 === 0 ? labCatalog[k % labCatalog.length] : null;
        const labInvoicePaid = invoicePaid;
        const labReq = labExam ? {
          id: id('labreq', k),
          patientId: patient.id,
          consultationId: consultId,
          examType: labExam.name,
          code: labExam.code,
          category: labExam.category,
          parameters: [...labExam.parameters],
          urgent: k % 13 === 0,
          status: labInvoicePaid ? (k % 8 === 0 ? 'completed' as const : 'paid' as const) : 'pending' as const,
          sampleType: labExam.sampleType,
          requestedAt: date,
          requestedBy: doctorId,
          invoiceId: id('invoice', k),
          price: patient.clientType === 'societe' ? labExam.priceSociete : labExam.priceComptoir,
          results: labInvoicePaid && k % 8 === 0 ? [{ parameter: labExam.name, value: 1, unit: '', normalMin: 0, normalMax: 2, isAbnormal: false }] : undefined,
          completedAt: labInvoicePaid && k % 8 === 0 ? date : undefined,
        } : null;

        const consultation: Consultation = {
          id: consultId,
          patientId: patient.id,
          doctorId,
          doctorName,
          date,
          vitalSigns: {
            temperature: (36.4 + (k % 8) / 10).toFixed(1),
            bloodPressureSystolic: String(110 + k % 25),
            bloodPressureDiastolic: String(70 + k % 15),
            heartRate: String(68 + k % 20),
            oxygenSaturation: String(96 + k % 4),
            weight: String(50 + n % 35),
            height: String(150 + n % 30),
          },
          visitReason: pick(['Contrôle médical', 'Fièvre', 'Douleur abdominale', 'Suivi thérapeutique', 'Bilan annuel']),
          diagnosis: pick(['Syndrome viral simple', 'Suivi clinique', 'Hypertension stabilisée', 'Infection bénigne']),
          notes: 'Donnée de démonstration synthétique.',
          prescriptions,
          labRequests: labReq ? [labReq] : [],
          hospitalizeRequested: k % 83 === 0,
          surgeryRequested: k % 157 === 0,
          isEmergency: k % 19 === 0,
        };
        consultations.push(consultation);
        if (labReq) labRequests.push(labReq);

        const items: Invoice['items'] = [
          { description: 'Consultation médicale', amount: 10000 + (k % 5) * 2500, category: 'consultation' },
          ...prescriptions.map((p) => ({ description: `${p.articleName} × ${p.quantity}`, amount: prescriptionAmount(p), category: 'pharmacy' as const })),
          ...(labReq ? [{ description: `${labReq.examType}${labReq.urgent ? ' (Urgent)' : ''}`, amount: labReq.price || 0, category: 'lab' as const }] : []),
        ];
        const totalAmount = invoiceAmount(items);
        const invoiceId = id('invoice', k);
        const invoice: Invoice = {
          id: invoiceId,
          patientId: patient.id,
          consultationId: consultId,
          clientName: `${patient.lastName} ${patient.firstName}`,
          clientType: patient.clientType,
          items,
          totalAmount,
          patientCharge: patient.clientType === 'societe' ? 0 : totalAmount,
          status: invoicePaid ? 'paid' : 'pending',
          paidAt: invoicePaid ? date : undefined,
          paidBy: invoicePaid ? 'USR-CASH' : undefined,
          createdAt: date,
          isExternal: false,
        };
        invoices.push(invoice);

        const venteId = id('vente', k);
        const vente: Vente = {
          id: venteId,
          patientId: patient.id,
          consultationId: consultId,
          numeroFacture: `FAC-${new Date(date).getUTCFullYear()}-${String(k + 1).padStart(6, '0')}`,
          type: prescriptions.length ? 'pharmacie' : labReq ? 'labo' : 'consultation',
          clientType: patient.clientType,
          clientName: `${patient.lastName} ${patient.firstName}`,
          company: patient.company,
          subtotal: totalAmount,
          remisePct: 0,
          remiseMontant: 0,
          montantFacture: totalAmount,
          montantPaye: invoicePaid ? totalAmount : 0,
          status: invoicePaid ? 'paid' : 'pending',
          isExterne: false,
          source: 'caisse',
          dateVente: date,
          datePaiement: invoicePaid ? date : undefined,
          paidAt: invoicePaid ? date : undefined,
          paidBy: invoicePaid ? 'USR-CASH' : undefined,
          paidByName: invoicePaid ? 'Miora Kanto' : undefined,
          createdAt: date,
          legacyInvoiceId: invoiceId,
        };
        ventes.push(vente);
        items.forEach((item, idx) => {
          venteLines.push({
            id: id('vline', k * 10 + idx),
            venteId,
            articleName: item.description,
            articleId: item.category === 'pharmacy' ? article.id : undefined,
            quantity: 1,
            unitPrice: item.amount,
            discount: 0,
            category: item.category,
            dateSort: date.slice(0, 10),
          });
        });
        if (invoicePaid) {
          ventePayments.push({
            id: id('payment', k),
            venteId,
            amount: totalAmount,
            method: pick(['Espèces', 'Mobile Money', 'Carte bancaire']),
            date,
            paidBy: 'Miora Kanto',
            paidByUserId: 'USR-CASH',
          });
        }

        if (delivered && prescriptions.length > 0) {
          prescriptions.forEach((p) => pharmaDeliveryItems.push({
            id: id('delivery', pharmaDeliveryItems.length),
            consultationId: consultId,
            patientId: patient.id,
            patientName: `${patient.lastName} ${patient.firstName}`,
            doctorName,
            articleId: p.articleId,
            articleName: p.articleName,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            posology: p.posology,
            deliveredAt: date,
            deliveredByUserId: 'USR-PHA',
            deliveredByName: 'Tiana Soa',
          }));
        }

        const status = invoicePaid
          ? delivered ? 'medications_delivered' : prescriptions.length ? 'invoice_paid' : labReq?.status === 'completed' ? 'analyses_complete' : 'completed'
          : 'consulted_awaiting_payment';
        lastStatus = status;
        lastVisitAt = date;
        journey.push({
          id: id('journey', 10000 + k),
          patientId: patient.id,
          timestamp: date,
          department: 'consultation',
          action: 'Consultation terminée',
          status,
          details: invoicePaid ? `Facture ${invoiceId} payée` : 'Facture en attente sans données de prescription affichables',
          actorName: doctorName,
          consultationId: consultId,
          invoiceId,
        });
      }
    }

    patient.status = lastStatus;
    patient.lastVisitAt = lastVisitAt;
  }

  const stockEntries = Array.from({ length: 180 }, (_, n) => {
    const a = articles[n % articles.length];
    return {
      id: id('entry', n),
      articleId: a.id,
      articleName: a.name,
      quantity: 40 + n % 160,
      purchasePrice: a.purchasePrice,
      supplier: `Fournisseur Démo ${n % 8 + 1}`,
      invoiceRef: `BL-${2024 + n % 3}-${String(n).padStart(5, '0')}`,
      expiryDate: '2027-12-31',
      date: iso(Math.floor(rnd() * 365)),
      enteredBy: 'Niry Tahina',
      destination: 'central' as const,
    };
  });

  const stockTransfers = Array.from({ length: 160 }, (_, n) => {
    const a = articles[n % articles.length];
    return {
      id: id('transfer', n),
      articleId: a.id,
      articleName: a.name,
      quantity: 2 + n % 20,
      category: n % 2 ? 'approvisionnement' as const : 'hospitalisation' as const,
      targetServiceId: n % 2 ? 'svc-pharmacie' : 'svc-bloc',
      targetServiceName: n % 2 ? 'Pharmacie' : 'Bloc opératoire',
      status: 'transferred' as const,
      requestedBy: 'USR-PHA',
      requestedAt: iso(Math.floor(rnd() * 365)),
      transferredBy: 'USR-MAG',
      transferredAt: iso(Math.floor(rnd() * 365)),
      requestSource: n % 2 ? 'pharmacy' as const : 'magasinier' as const,
    };
  });

  const movementHeaders = [
    ...stockEntries.map((e, n) => ({
      id: id('move', n), type: 'achat' as const, ref: e.invoiceRef, date: e.date,
      userId: 'USR-MAG', userName: 'Niry Tahina', toLocation: 'central', totalQuantity: e.quantity, status: 'completed' as const,
    })),
    ...stockTransfers.map((t, n) => ({
      id: id('move-transfer', n), type: 'transfert' as const, ref: `TR-${n}`, date: t.transferredAt!,
      userId: 'USR-MAG', userName: 'Niry Tahina', fromLocation: 'central', toLocation: t.targetServiceId!, totalQuantity: t.quantity, status: 'completed' as const,
    })),
  ];

  const movementLines = [
    ...stockEntries.map((e, n) => ({
      id: id('moveline', n), movementId: id('move', n), articleId: e.articleId, articleName: e.articleName, quantity: e.quantity, purchasePrice: e.purchasePrice,
    })),
    ...stockTransfers.map((t, n) => ({
      id: id('moveline-transfer', n), movementId: id('move-transfer', n), articleId: t.articleId, articleName: t.articleName, quantity: t.quantity,
    })),
  ];

  const stockMovements = [
    ...stockEntries.map((e, n) => ({
      id: id('stockmove-entry', n), type: 'entry' as const, articleId: e.articleId, articleName: e.articleName, quantity: e.quantity,
      fromLocation: 'supplier', toLocation: 'central', ref: e.invoiceRef, date: e.date, userId: 'USR-MAG', userName: 'Niry Tahina',
    })),
    ...stockTransfers.map((t, n) => ({
      id: id('stockmove-transfer', n), type: 'transfer' as const, articleId: t.articleId, articleName: t.articleName, quantity: t.quantity,
      fromLocation: 'central', toLocation: t.targetServiceId!, ref: `TR-${n}`, date: t.transferredAt!, userId: 'USR-MAG', userName: 'Niry Tahina',
    })),
  ];

  const billingMonths = [...Array(12)].map((_, i) => {
    const d = new Date(END);
    d.setUTCMonth(d.getUTCMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const companyBillingAccounts = companies.filter(c => c.settlementMode === 'monthly_global').flatMap((c, ci) =>
    billingMonths.map((month, mi) => {
      const ids = invoices
        .filter(inv => inv.clientType === 'societe' && patients.find(p => p.id === inv.patientId)?.company === c.name && inv.createdAt.slice(0, 7) === month)
        .map(inv => inv.id);
      const total = ids.reduce((s, invId) => s + (invoices.find(inv => inv.id === invId)?.totalAmount || 0), 0);
      if (!total) return null;
      const accountPaid = mi > 5;
      return {
        id: `statement-${ci}-${month}`,
        company: c.name,
        month,
        invoiceIds: ids,
        totalAmount: total,
        paidAmount: accountPaid ? total : 0,
        status: accountPaid ? 'paid' as const : 'open' as const,
        createdAt: `${month}-01T08:00:00.000Z`,
        payments: accountPaid ? [{ id: `statement-payment-${ci}-${month}`, amount: total, date: `${month}-25T10:00:00.000Z`, method: 'Virement', reference: `VIR-${month}` }] : [],
      };
    }).filter(Boolean)
  ) as AppState['companyBillingAccounts'];

  // Cohérence démo : les relevés déjà soldés marquent aussi leurs factures comme payées.
  companyBillingAccounts
    .filter((account) => account.status === 'paid')
    .forEach((account) => {
      const paidAt = account.payments[0]?.date || `${account.month}-25T10:00:00.000Z`;
      invoices.forEach((inv) => {
        if (!account.invoiceIds.includes(inv.id)) return;
        inv.status = 'paid';
        inv.paidAt = inv.paidAt || paidAt;
        inv.paidBy = inv.paidBy || 'USR-BIL';
      });
    });

  const hbRecords = patients.filter((_, n) => n % 12 === 0).map((p, n) => ({
    id: id('hb', n),
    patientId: p.id,
    patientName: `${p.lastName} ${p.firstName}`,
    clientType: p.clientType,
    company: p.company,
    type: n % 2 ? 'hospit' as const : 'bloc' as const,
    lines: [{ id: id('hbline', n), articleName: n % 2 ? 'Séjour hospitalier' : 'Acte bloc', quantity: 1, unitPrice: 65000 + n * 5000, discount: 0, dateSort: iso(n * 10).slice(0, 10) }],
    payments: n % 2 ? [{ amount: 30000, paidBy: 'Miora Kanto', date: iso(n * 10), paidByUserId: 'USR-CASH', receivedBy: 'caisse' as const }] : [],
    openedAt: iso(n * 10),
    openedBy: 'Miora Kanto',
    openedByUserId: 'USR-CASH',
  }));

  return {
    currentUser: null,
    ticketSettings: {
      facilityName: 'SALFA — Démonstration',
      address: 'Antananarivo, Madagascar',
      phone: '',
      nif: '',
      logoUrl: '',
      receiptTitle: 'REÇU DE PAIEMENT',
      footerMessage: 'Jeu de données fictif.',
      paperWidth: 80,
      autoPrint: true,
      showLogo: true,
      showBarcode: true,
      showSignature: true,
      copies: 1,
      currency: 'Ar',
      paymentMethods: ['Espèces', 'Carte bancaire', 'Mobile Money', 'Virement', 'Chèque'],
      invoicePrefix: 'FAC',
    },
    patients,
    consultations,
    invoices,
    cashClosings: [],
    articles,
    stockTransfers,
    stockEntries,
    auditLogs: [],
    notifications: Array.from({ length: 24 }, (_, n) => ({
      id: id('notification', n),
      targetRole: pick(['billing', 'pharmacy', 'laboratory'] as const),
      message: `Notification de démonstration ${n + 1}`,
      type: 'info' as const,
      timestamp: iso(n % 365),
      read: n % 3 === 0,
    })),
    messages: Array.from({ length: 36 }, (_, n) => ({
      id: id('message', n),
      fromUserId: 'USR-REC',
      fromUserName: 'Aina Rakoto',
      toUserId: n % 2 ? 'USR-DOC' : 'USR-CASH',
      toUserName: n % 2 ? 'Dr. Feno Rasoana' : 'Miora Kanto',
      content: `Message de coordination fictif n°${n + 1}.`,
      timestamp: iso(n % 365),
      read: n % 2 === 0,
    })),
    users,
    companies,
    companyBillingAccounts,
    fournisseurs: Array.from({ length: 8 }, (_, n) => ({
      id: id('supplier', n),
      name: `Fournisseur Démo ${n + 1}`,
      contactPerson: `Contact Fictif ${n + 1}`,
      phone: `032 ${String(1000000 + n).padStart(7, '0')}`,
      address: `Zone commerciale ${n + 1}`,
      createdAt: iso(720 - n),
    })),
    familles: [
      { id: 'family-medic', code: 'MEDIC', name: 'Médicaments', color: '#0D47A1', order: 1 },
      { id: 'family-labo', code: 'LABO', name: 'Laboratoire', color: '#10B981', order: 2 },
      { id: 'family-dent', code: 'DENT', name: 'Dentaire', color: '#8B5CF6', order: 3 },
      { id: 'family-echo', code: 'ECHO', name: 'Échographie', color: '#F59E0B', order: 4 },
    ],
    journey,
    labRequests,
    labCatalog,
    warehouseServices: [
      { id: 'svc-pharmacie', code: 'PHA', name: 'Pharmacie', kind: 'pharmacie', color: 'purple', active: true, createdAt: iso(720) },
      { id: 'svc-bloc', code: 'BLOC', name: 'Bloc opératoire', kind: 'service', color: 'blue', active: true, createdAt: iso(720) },
      { id: 'svc-soins', code: 'SOINS', name: 'Soins / Hospitalisation', kind: 'service', color: 'rose', active: true, createdAt: iso(720) },
    ],
    stockMovements,
    inventorySessions: [],
    movementHeaders,
    movementLines,
    pharmaDeliveryItems,
    pharmaDeliveryClosings: [],
    pharmaClosingCounter: 0,
    hbRecords,
    ventes,
    venteLines,
    ventePayments,
    factureCounter: ventes.length,
  };
}
