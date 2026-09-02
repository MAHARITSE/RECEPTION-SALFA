/**
 * generate_base_3mois.cjs
 * ==========================================================================
 * RÉINITIALISATION COMPLÈTE de src/data/localData.json puis génération d'un
 * jeu de données de DÉMONSTRATION couvrant 3 mois pleins (Juin, Juillet,
 * Août 2026) sur TOUS les modules, pour permettre l'analyse :
 *
 *   • ACHATS        : entrées fournisseurs au dépôt central (stockEntries,
 *                     stockMovements, movementHeaders/movementLines type achat)
 *   • LIVRAISONS    : transferts Central → Pharmacie / Services
 *                     (livrés ET demandes NON LIVRÉES en attente)
 *   • PATIENTS      : comptoir, salariés conventionnés (société), externes
 *   • CONSULTATIONS : motifs, diagnostics, prescriptions (délivrées / NON délivrées)
 *   • ANALYSES      : demandes labo (terminées, en cours, prélèvement reçu, en attente)
 *   • VENTES        : table unifiée ventes / venteLines / ventePayments
 *                     (payées, PARTIELLES, NON PAYÉES)
 *   • CAISSE        : factures payées / impayées, clôtures Z, hospit & bloc
 *   • PHARMACIE     : livraisons d'ordonnances + clôtures de garde
 *   • SOCIÉTÉS      : comptes mensuels soldés, partiels et IMPAYÉS
 *   • MAGASIN       : inventaires, mouvements, stocks cohérents
 *
 * Les référentiels (utilisateurs, sociétés, articles, fournisseurs, familles,
 * catalogue labo, services, établissement, paramètres d'impression) sont
 * conservés ; TOUTES les données transactionnelles sont remises à zéro.
 *
 * Usage :  node generate_base_3mois.cjs
 * Idempotent : relançable à volonté, le résultat est identique (PRNG fixe).
 * ==========================================================================
 */
const fs = require('fs');
const crypto = require('crypto');

const FILE = './src/data/localData.json';
const base = JSON.parse(fs.readFileSync(FILE, 'utf-8'));

/* ------------------------------------------------------------------ */
/* Aléatoire déterministe                                             */
/* ------------------------------------------------------------------ */
let seedState = 987654321;
function rnd() {
  seedState |= 0; seedState = (seedState + 0x6D2B79F5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];
const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));
let uuidSeq = 0;
function uuid() {
  const h = crypto.createHash('md5').update('salfa3m-' + (uuidSeq++)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/* ------------------------------------------------------------------ */
/* Référentiels conservés                                             */
/* ------------------------------------------------------------------ */
const users = base.users;
const companies = base.companies;
const fournisseurs = base.fournisseurs;
const labCatalog = base.labCatalog;
const services = base.warehouseServices;
const familles = base.familles;

const U = {
  admin: users.find((u) => u.role === 'admin'),
  rec: users.find((u) => u.role === 'receptionist'),
  docs: users.filter((u) => u.role === 'doctor'),
  cash: users.filter((u) => u.role === 'cashier'),
  pha: users.filter((u) => u.role === 'pharmacy'),
  lab: users.find((u) => u.role === 'laboratory'),
  mag: users.find((u) => u.role === 'magasinier'),
  bil: users.find((u) => u.role === 'billing'),
};

/* Articles : on repart de stocks de départ maîtrisés */
const articles = base.articles.map((a) => ({
  ...a,
  stockCentral: a.family === 'MEDIC' || a.family === 'DENT' || ['art-006', 'art-007', 'art-008', 'art-lab-015'].includes(a.id) ? randInt(120, 500) : 0,
  stockPharmacie: 0,
  serviceStocks: {},
  serviceMinStocks: a.serviceMinStocks || {},
  saleBlocked: false,
}));
const artById = Object.fromEntries(articles.map((a) => [a.id, a]));
/** Articles gérés en stock (achetables / livrables) */
const STOCK_ARTICLES = articles.filter((a) => a.purchasePrice > 0);
/** Médicaments vendables en pharmacie */
const MEDS = articles.filter((a) => a.family === 'MEDIC');

/* ------------------------------------------------------------------ */
/* Calendrier : 3 mois pleins révolus                                 */
/* ------------------------------------------------------------------ */
const MONTHS = [
  { key: '2026-06', y: 2026, m: 6, days: 30, label: 'Juin 2026' },
  { key: '2026-07', y: 2026, m: 7, days: 31, label: 'Juillet 2026' },
  { key: '2026-08', y: 2026, m: 8, days: 31, label: 'Août 2026' },
];
const iso = (y, m, d, h = 9, mi = 0) => new Date(Date.UTC(y, m - 1, d, h, mi, randInt(0, 59))).toISOString();
const dayIso = (mo, d, h, mi) => iso(mo.y, mo.m, d, h, mi);
const monthOf = (s) => s.slice(0, 7);
const dateOnly = (s) => s.slice(0, 10);
const plusHours = (s, h) => new Date(new Date(s).getTime() + h * 3600e3).toISOString();

/* ------------------------------------------------------------------ */
/* Tables générées                                                    */
/* ------------------------------------------------------------------ */
const patients = [];
const consultations = [];
const invoices = [];
const ventes = [];
const venteLines = [];
const ventePayments = [];
const labRequests = [];
const journey = [];
const auditLogs = [];
const notifications = [];
const messages = [];
const stockEntries = [];
const stockTransfers = [];
const stockMovements = [];
const movementHeaders = [];
const movementLines = [];
const inventorySessions = [];
const pharmaDeliveryItems = [];
const pharmaDeliveryClosings = [];
const hbRecords = [];
const cashClosings = [];
const companyBillingAccounts = [];

let facSeq = 0;
const mkFac = () => `FAC-2026-${String(++facSeq).padStart(4, '0')}`;
let dossierSeq = 1000;
const mkDossier = (ln) => `${ln.slice(0, 3).toUpperCase()}${++dossierSeq}`;

function log(action, details, date, user, patientId) {
  auditLogs.push({
    id: uuid(), timestamp: date, userId: user?.id || 'SYSTEM', userName: user?.name || 'Système',
    userRole: user?.role || 'admin', action, details, patientId,
  });
}
function addJourney(patientId, timestamp, department, action, status, extra = {}) {
  journey.push({ id: uuid(), patientId, timestamp, department, action, status, ...extra });
}

/* ------------------------------------------------------------------ */
/* Identités malgaches                                                */
/* ------------------------------------------------------------------ */
const PRENOMS_M = ['Jean', 'Hery', 'Mamy', 'Tovo', 'Ny Aina', 'Andry', 'Mihaja', 'Toky', 'Dina', 'Rija', 'Zo', 'Solofo', 'Naina', 'Faniry', 'Feno', 'Manda', 'Tahiry', 'Tojo', 'Hasina', 'Fanomezana'];
const PRENOMS_F = ['Voahangy', 'Nirina', 'Ravo', 'Fara', 'Lova', 'Miora', 'Tiana', 'Aina', 'Tendry', 'Vololona', 'Hanta', 'Soa', 'Vola', 'Harena', 'Noro', 'Fetra', 'Bako', 'Hanitra', 'Sarah', 'Claudine'];
const NOMS = ['RAKOTO', 'RABE', 'RAZAFY', 'RANDRIA', 'RAMANANTSOA', 'RAKOTOMALALA', 'ANDRIANARISOA', 'RAVELO', 'RASOAMANANA', 'RAKOTONDRABE', 'RAZANADRAKOTO', 'RAZAFINDRAKOTO', 'ANDRIAMANANA', 'RANDRIANASOLO', 'RAKOTONIRINA', 'RAJAOFERA', 'ANDRIAMBOLOLONA', 'RASOLOFOSON'];
const DISTRICTS = ['ANALAKELY', 'ISOTRY', 'ANDRAVOAHANGY', 'AMBANIDIA', 'IVATO', 'AMPASAMADINIKA', 'ANTOHOMADINIKA', 'BEHORIRIKA', '67 HA', 'TSARALALANA', 'AMPANDRANA', 'ANDOHARANOFOTSY', 'ITAOSY', 'ANOSIZATO'];
const MOTIFS = ['Fièvre et céphalées', 'Douleur abdominale', 'Toux persistante', 'Contrôle médical', 'Fatigue générale', 'Maux de gorge', 'Douleur dorsale', 'Suivi tension artérielle', 'Diarrhée', 'Douleur articulaire', 'Suivi grossesse', 'Consultation pré-opératoire', 'Vertiges', 'Éruption cutanée'];
const DIAGS = ['Paludisme simple, traitement prescrit.', 'Infection respiratoire aiguë, antibiothérapie.', 'Hypertension artérielle équilibrée.', 'Gastrite aiguë, traitement symptomatique.', 'Épisode fébrile, surveillance.', 'Lombalgie commune, AINS.', 'Anémie légère, supplémentation martiale.', 'Grossesse normale, suivi prénatal.', 'RAS — contrôle de routine.', 'Angine, traitement symptomatique.', 'Diabète type 2 déséquilibré.', 'Infection urinaire basse.'];

function vitals() {
  return {
    temperature: (36 + rnd() * 3).toFixed(1),
    bloodPressureSystolic: String(randInt(100, 160)),
    bloodPressureDiastolic: String(randInt(60, 100)),
    heartRate: String(randInt(60, 105)),
    oxygenSaturation: String(randInt(94, 100)),
    weight: String(randInt(45, 95)),
    height: String(randInt(150, 185)),
    tdr: '',
  };
}
const phone = () => `03${randInt(2, 4)} ${randInt(10, 99)} ${randInt(100, 999)} ${randInt(10, 99)}`;
function makePatient(clientType, company, registeredAt) {
  const isF = rnd() < 0.53;
  const ln = pick(NOMS);
  const y = randInt(1955, 2015);
  const dob = `${y}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;
  const p = {
    id: uuid(), dossier: mkDossier(ln),
    firstName: (isF ? pick(PRENOMS_F) : pick(PRENOMS_M)).toUpperCase(), lastName: ln,
    dateOfBirth: dob, age: `${2026 - y} Ans`, gender: isF ? 'F' : 'M',
    address: `${pick(DISTRICTS)}, ANTANANARIVO`, contact: phone(), ssn: '',
    clientType, allergies: [], chronicTreatments: [], antecedents: [],
    bloodGroup: pick(['A+', 'O+', 'B+', 'AB+', 'O-', 'A-']),
    registeredAt, registeredBy: U.rec.id, status: 'completed',
  };
  if (clientType === 'societe' && company) {
    p.company = company.name;
    p.matricule = `MAT-${company.name.slice(0, 4).toUpperCase().replace(/\s/g, '')}${randInt(1000, 9999)}`;
    p.insureName = company.name;
  }
  patients.push(p);
  addJourney(p.id, registeredAt, 'reception', 'Dossier patient créé', 'registered', { actorId: U.rec.id, actorName: U.rec.name });
  return p;
}

/* ------------------------------------------------------------------ */
/* 1. ACHATS — entrées fournisseurs au dépôt central                  */
/* ------------------------------------------------------------------ */
let blSeq = 0;
function achat(mo, day) {
  const supplier = pick(fournisseurs);
  const date = dayIso(mo, day, randInt(8, 11), randInt(0, 59));
  const ref = `BL-2026-${String(++blSeq).padStart(4, '0')}`;
  const nbLines = randInt(3, 7);
  const chosen = [];
  while (chosen.length < nbLines) {
    const a = pick(STOCK_ARTICLES);
    if (!chosen.includes(a)) chosen.push(a);
  }
  const movementId = uuid();
  const lines = [];
  chosen.forEach((a) => {
    const qty = randInt(30, 220);
    const pp = Math.round(a.purchasePrice * (0.92 + rnd() * 0.18));
    a.stockCentral += qty;
    a.purchasePrice = pp;
    a.supplier = supplier.name;
    stockEntries.push({
      id: uuid(), articleId: a.id, articleName: a.name, quantity: qty, purchasePrice: pp,
      supplier: supplier.name, invoiceRef: ref, expiryDate: `202${randInt(7, 9)}-${String(randInt(1, 12)).padStart(2, '0')}-28`,
      date, enteredBy: U.mag.id, category: 'central', destination: 'central',
    });
    stockMovements.push({
      id: uuid(), type: 'entry', articleId: a.id, articleName: a.name, quantity: qty,
      fromLocation: 'external', toLocation: 'central', reason: `Achat fournisseur ${supplier.name}`,
      ref, date, userId: U.mag.id, userName: U.mag.name,
    });
    lines.push({ id: uuid(), movementId, articleId: a.id, articleName: a.name, quantity: qty, purchasePrice: pp, reason: `Achat ${supplier.name}` });
  });
  movementHeaders.push({
    id: movementId, type: 'achat', ref, date, userId: U.mag.id, userName: U.mag.name,
    fromLocation: 'external', toLocation: 'central',
    totalQuantity: lines.reduce((s, l) => s + l.quantity, 0),
    notes: `Achat fournisseur ${supplier.name}`, status: 'completed',
  });
  movementLines.push(...lines);
  const total = lines.reduce((s, l) => s + l.quantity * l.purchasePrice, 0);
  log('ACHAT_DEPOT_CENTRAL', `Entrée d'achat ${lines.length} article(s) de ${supplier.name} (BL: ${ref}) — ${total.toLocaleString('fr-FR')} Ar`, date, U.mag);
}

/* ------------------------------------------------------------------ */
/* 2. LIVRAISONS / TRANSFERTS Central → Pharmacie & Services          */
/* ------------------------------------------------------------------ */
const svcPharma = services.find((s) => s.kind === 'pharmacie');
const svcOthers = services.filter((s) => s.kind === 'service');

function transfert(mo, day, { livre }) {
  const requestedAt = dayIso(mo, day, randInt(8, 15), randInt(0, 59));
  const toPharma = rnd() < 0.65;
  const svc = toPharma ? svcPharma : pick(svcOthers);
  const a = pick(toPharma ? MEDS : STOCK_ARTICLES);
  const qty = randInt(10, 60);
  const requestSource = toPharma ? 'pharmacy' : 'hospitalisation';
  const tr = {
    id: uuid(), articleId: a.id, articleName: a.name, quantity: qty,
    category: toPharma ? 'approvisionnement' : (svc.code === 'BLOC' ? 'bloc' : 'hospitalisation'),
    purchasePrice: a.purchasePrice, supplier: a.supplier,
    requestedBy: toPharma ? U.pha[0].id : U.mag.id, requestedAt,
    status: livre ? 'transferred' : 'requested',
    notes: livre ? `Réapprovisionnement ${svc.name}` : `Demande en attente — ${svc.name}`,
    targetServiceId: svc.id, targetServiceName: svc.name, requestSource,
  };
  if (livre) {
    const transferredAt = plusHours(requestedAt, randInt(1, 8));
    tr.transferredBy = U.mag.id;
    tr.transferredAt = transferredAt;
    const give = Math.min(qty, a.stockCentral);
    a.stockCentral -= give;
    if (toPharma) a.stockPharmacie += give;
    else a.serviceStocks[svc.id] = (a.serviceStocks[svc.id] || 0) + give;
    stockMovements.push({
      id: uuid(), type: 'transfer', articleId: a.id, articleName: a.name, quantity: give,
      fromLocation: 'central', toLocation: toPharma ? 'pharmacie' : svc.id,
      reason: `Transfert vers ${svc.name}`, ref: tr.id.slice(0, 8), date: transferredAt,
      userId: U.mag.id, userName: U.mag.name,
      serviceId: toPharma ? undefined : svc.id, serviceName: svc.name,
    });
    const movementId = uuid();
    movementHeaders.push({
      id: movementId, type: 'transfert', ref: tr.id.slice(0, 8), date: transferredAt,
      userId: U.mag.id, userName: U.mag.name, fromLocation: 'central',
      toLocation: toPharma ? 'pharmacie' : svc.id, totalQuantity: give,
      notes: `Transfert vers ${svc.name}`, status: 'completed',
    });
    movementLines.push({ id: uuid(), movementId, articleId: a.id, articleName: a.name, quantity: give, reason: `Transfert vers ${svc.name}` });
    log('DISPERSION_SERVICE', `${a.name} ×${give} : Central → ${svc.name}`, transferredAt, U.mag);
  } else {
    notifications.push({
      id: uuid(), targetRole: 'magasinier',
      message: `📦 Demande de réapprovisionnement en attente : ${a.name} (${qty}) pour ${svc.name}`,
      type: 'warning', timestamp: requestedAt, read: false,
    });
  }
  stockTransfers.push(tr);
}

/* ------------------------------------------------------------------ */
/* 3. Prestations facturables                                         */
/* ------------------------------------------------------------------ */
const CONSULT = [
  { d: 'Consultation Générale', p: 15000 },
  { d: 'Consultation Spécialiste', p: 35000 },
  { d: 'Consultation Urgences', p: 25000 },
];
const ECHOS = articles.filter((a) => a.family === 'ECHO' && a.purchasePrice === 0);
const LABS = labCatalog;

const LAB_NORMS = {
  'Hémoglobine': { min: 12, max: 17, unit: 'g/dL' },
  'Globules Blancs': { min: 4, max: 10, unit: 'G/L' },
  'Globules Rouges': { min: 4.2, max: 5.9, unit: 'T/L' },
  'Plaquettes': { min: 150, max: 400, unit: 'G/L' },
  'Hématocrite': { min: 37, max: 50, unit: '%' },
  'Glucose': { min: 0.7, max: 1.1, unit: 'g/L' },
  'CRP': { min: 0, max: 5, unit: 'mg/L' },
  'Créatinine': { min: 6, max: 12, unit: 'mg/L' },
  'Urée': { min: 0.15, max: 0.45, unit: 'g/L' },
  'Acide Urique': { min: 30, max: 70, unit: 'mg/L' },
  'Cholestérol Total': { min: 1.5, max: 2, unit: 'g/L' },
  'HDL': { min: 0.4, max: 0.8, unit: 'g/L' },
  'LDL': { min: 0.5, max: 1.6, unit: 'g/L' },
  'Triglycérides': { min: 0.5, max: 1.5, unit: 'g/L' },
  'ASAT': { min: 5, max: 40, unit: 'UI/L' },
  'ALAT': { min: 5, max: 45, unit: 'UI/L' },
  'GGT': { min: 10, max: 55, unit: 'UI/L' },
  'Bilirubine': { min: 3, max: 12, unit: 'mg/L' },
  'Sodium': { min: 135, max: 145, unit: 'mmol/L' },
  'Potassium': { min: 3.5, max: 5, unit: 'mmol/L' },
  'Chlore': { min: 98, max: 107, unit: 'mmol/L' },
  'TP': { min: 70, max: 100, unit: '%' },
  'INR': { min: 0.8, max: 1.2, unit: '' },
};
const QUALI = new Set(['Plasmodium', 'TDR Paludisme', 'VIH 1/2', 'TPHA/VDRL', 'Culture', 'Antibiogramme', 'Groupe ABO', 'Rhésus']);
function labResults(params) {
  return params.map((param) => {
    if (QUALI.has(param)) {
      if (param === 'Groupe ABO') return { parameter: param, value: pick(['A', 'B', 'O', 'AB']), unit: '', isAbnormal: false, normalRangeText: '—' };
      if (param === 'Rhésus') return { parameter: param, value: pick(['Positif', 'Négatif']), unit: '', isAbnormal: false, normalRangeText: '—' };
      const pos = rnd() < 0.12;
      return { parameter: param, value: pos ? 'Positif' : 'Négatif', unit: '', normalRangeText: 'Négatif', isAbnormal: pos };
    }
    const n = LAB_NORMS[param];
    if (!n) return { parameter: param, value: '—', unit: '', isAbnormal: false };
    const abn = rnd() < 0.16;
    const span = n.max - n.min;
    let v = abn
      ? (rnd() < 0.5 ? Math.max(0, n.min - span * (0.15 + rnd() * 0.5)) : n.max + span * (0.15 + rnd() * 0.6))
      : n.min + span * rnd();
    v = Math.round(v * 100) / 100;
    return { parameter: param, value: v, unit: n.unit, normalMin: n.min, normalMax: n.max, normalRangeText: `${n.min} - ${n.max} ${n.unit}`, isAbnormal: abn };
  });
}

const priceOf = (obj, ct) => ct === 'societe' ? obj.priceSociete : ct === 'externe' ? obj.priceExterne : obj.priceComptoir;

/* ------------------------------------------------------------------ */
/* 4. Épisode de soin complet                                         */
/* ------------------------------------------------------------------ */
/**
 * @param opts.paymentState 'paid' | 'pending' | 'partiel'
 * @param opts.labState     'completed' | 'in_progress' | 'sample_received' | 'pending'
 * @param opts.deliverMeds  true = ordonnance délivrée, false = NON livrée
 */
function episode(patient, date, opts) {
  const ct = patient.clientType;
  const doc = pick(U.docs);
  const cashier = pick(U.cash);
  const items = [];
  const lines = [];

  /* -- consultation -- */
  const c = pick(CONSULT);
  const consultPrice = ct === 'societe' ? Math.round(c.p * 0.9) : ct === 'externe' ? Math.round(c.p * 1.15) : c.p;
  items.push({ code: 'CONS', description: c.d, quantity: 1, unitPrice: consultPrice, amount: consultPrice, category: 'consultation' });
  lines.push({ articleName: c.d, quantity: 1, unitPrice: consultPrice, discount: 0, category: 'consultation' });

  /* -- prescriptions -- */
  const prescriptions = [];
  const wantMeds = rnd() < 0.72;
  if (wantMeds) {
    const nb = randInt(1, 3);
    const used = [];
    for (let i = 0; i < nb; i++) {
      const a = pick(MEDS);
      if (used.includes(a.id)) continue;
      used.push(a.id);
      const qty = randInt(1, 20);
      const up = priceOf(a, ct);
      prescriptions.push({
        id: uuid(), articleId: a.id, articleName: a.name, quantity: qty,
        posology: pick(['1 cp x 3/jour', '1 cp matin et soir', '2 cp par jour', '1 gélule x 2/jour', '1 application/jour']),
        duration: `${randInt(3, 10)} jours`, instructions: pick(['Après repas', 'À jeun', 'Avec un grand verre d\'eau', '']),
        unitPrice: up, discount: 0, delivered: false,
      });
      items.push({ code: a.id, description: a.name, quantity: qty, unitPrice: up, amount: up * qty, category: 'pharmacy' });
      lines.push({ articleId: a.id, articleName: a.name, quantity: qty, unitPrice: up, discount: 0, category: 'pharmacy' });
    }
  }

  /* -- analyses -- */
  const consultId = uuid();
  const consultLabs = [];
  if (rnd() < 0.45) {
    const nb = randInt(1, 2);
    const used = [];
    for (let i = 0; i < nb; i++) {
      const ex = pick(LABS);
      if (used.includes(ex.id)) continue;
      used.push(ex.id);
      const price = priceOf(ex, ct);
      const urgent = rnd() < 0.15;
      const st = opts.labState;
      const req = {
        id: uuid(), patientId: patient.id, consultationId: consultId, examType: ex.name, code: ex.code,
        category: ex.category, parameters: ex.parameters, urgent,
        status: st, sampleType: ex.sampleType,
        sampleReceived: st !== 'pending',
        sampleReceivedAt: st !== 'pending' ? plusHours(date, 1) : undefined,
        requestedBy: doc.id, requestedAt: date, price: urgent ? ex.urgentPrice : price,
      };
      if (st === 'completed') {
        const res = labResults(ex.parameters);
        const abn = res.some((r) => r.isAbnormal);
        req.results = res;
        req.completedAt = plusHours(date, ex.durationHours || 4);
        req.completedBy = U.lab.id;
        req.validatedBy = U.lab.id;
        req.biologicalAlert = abn;
        req.labConclusion = abn ? 'Anomalie significative détectée — avis médical recommandé.' : 'Bilan dans les limites de la normale.';
      }
      labRequests.push(req);
      consultLabs.push(req);
      items.push({ code: ex.code, description: ex.name, quantity: 1, unitPrice: req.price, amount: req.price, category: 'lab' });
      lines.push({ articleName: ex.name, quantity: 1, unitPrice: req.price, discount: 0, category: 'lab' });
    }
  }

  /* -- échographie -- */
  const echoRequests = [];
  if (rnd() < 0.14 && ECHOS.length) {
    const e = pick(ECHOS);
    const price = priceOf(e, ct);
    echoRequests.push({
      id: uuid(), patientId: patient.id, consultationId: consultId, examType: e.name,
      urgent: false, status: opts.paymentState === 'paid' ? 'completed' : 'pending',
      requestedBy: doc.id, requestedAt: date, price,
      completedAt: opts.paymentState === 'paid' ? plusHours(date, 2) : undefined,
    });
    items.push({ code: e.id, description: e.name, quantity: 1, unitPrice: price, amount: price, category: 'echo' });
    lines.push({ articleId: e.id, articleName: e.name, quantity: 1, unitPrice: price, discount: 0, category: 'echo' });
  }

  const total = items.reduce((s, i) => s + i.amount, 0);

  /* -- consultation -- */
  const consultation = {
    id: consultId, patientId: patient.id, doctorId: doc.id, doctorName: doc.name, date,
    vitalSigns: vitals(), visitReason: pick(MOTIFS), diagnosis: pick(DIAGS),
    notes: pick(['Repos conseillé.', 'Revoir dans 7 jours.', 'Régime pauvre en sel.', 'Hydratation abondante.', '']),
    prescriptions, labRequests: consultLabs, echoRequests,
    hospitalizeRequested: false, surgeryRequested: false, isEmergency: c.d.includes('Urgences'),
  };
  consultations.push(consultation);
  addJourney(patient.id, date, 'consultation', 'Consultation médicale', 'in_consultation', { actorId: doc.id, actorName: doc.name, consultationId: consultId });

  /* -- facture (legacy) -- */
  const isSociete = ct === 'societe';
  const paid = opts.paymentState === 'paid';
  const paidAt = paid ? plusHours(date, 1) : undefined;
  const invoice = {
    id: uuid(), patientId: patient.id, consultationId: consultId,
    clientName: `${patient.lastName} ${patient.firstName}`, clientType: ct, items,
    totalAmount: total, patientCharge: isSociete ? 0 : total,
    status: paid ? 'paid' : 'pending',
    paidAt, paidBy: paid ? (isSociete ? U.bil.id : cashier.id) : undefined,
    createdAt: date, isExternal: false,
  };
  if (isSociete) invoice.creditSociete = true;
  invoices.push(invoice);

  /* -- vente unifiée -- */
  const venteId = uuid();
  const montantPaye = opts.paymentState === 'paid' ? total : opts.paymentState === 'partiel' ? Math.round(total * (0.3 + rnd() * 0.4)) : 0;
  const vType = items.some((i) => i.category === 'echo') ? 'echo'
    : items.some((i) => i.category === 'lab') ? 'labo'
      : items.some((i) => i.category === 'pharmacy') ? 'pharmacie' : 'consultation';
  ventes.push({
    id: venteId, patientId: patient.id, consultationId: consultId, numeroFacture: mkFac(),
    type: vType, clientType: ct, clientName: `${patient.lastName} ${patient.firstName}`,
    company: patient.company, subtotal: total, remisePct: 0, remiseMontant: 0,
    montantFacture: total, montantPaye,
    status: opts.paymentState === 'paid' ? 'paid' : opts.paymentState === 'partiel' ? 'partiel' : 'pending',
    isExterne: false, source: 'caisse', dateVente: date,
    datePaiement: montantPaye > 0 ? plusHours(date, 1) : undefined,
    paidAt, createdBy: cashier.id, createdByName: cashier.name,
    paidBy: paid ? cashier.id : undefined, paidByName: paid ? cashier.name : undefined,
    createdAt: date, legacyInvoiceId: invoice.id,
  });
  lines.forEach((l) => venteLines.push({ id: uuid(), venteId, dateSort: dateOnly(date), ...l }));
  if (montantPaye > 0) {
    ventePayments.push({
      id: uuid(), venteId, amount: montantPaye, method: pick(['Espèces', 'Mobile Money', 'Carte bancaire', 'Virement']),
      date: plusHours(date, 1), paidBy: cashier.name, paidByUserId: cashier.id,
    });
  }

  if (paid) {
    addJourney(patient.id, paidAt, 'caisse', isSociete ? 'Validé en crédit société' : 'Paiement encaissé', 'invoice_paid', { actorId: cashier.id, actorName: cashier.name, invoiceId: invoice.id });
    log('PAIEMENT_FACTURE', `Facture ${total.toLocaleString('fr-FR')} Ar — ${patient.lastName} ${patient.firstName} (${ct})`, paidAt, cashier, patient.id);
  } else {
    addJourney(patient.id, date, 'caisse', opts.paymentState === 'partiel' ? 'Paiement partiel enregistré' : 'Facture en attente de règlement', 'consulted_awaiting_payment', { actorId: cashier.id, actorName: cashier.name, invoiceId: invoice.id });
  }

  /* -- laboratoire : parcours -- */
  consultLabs.forEach((r) => {
    if (r.status === 'completed') addJourney(patient.id, r.completedAt, 'laboratoire', `Résultat validé — ${r.examType}`, 'analyses_complete', { actorId: U.lab.id, actorName: U.lab.name, labRequestId: r.id });
    else addJourney(patient.id, date, 'laboratoire', `Analyse en attente — ${r.examType}`, 'analyses_pending', { actorId: U.lab.id, actorName: U.lab.name, labRequestId: r.id });
  });

  /* -- pharmacie : livraison ou non -- */
  if (prescriptions.length && paid && opts.deliverMeds) {
    const phar = pick(U.pha);
    const deliveredAt = plusHours(date, 2);
    prescriptions.forEach((pr) => {
      pr.delivered = true;
      const a = artById[pr.articleId];
      const give = Math.min(pr.quantity, a.stockPharmacie);
      a.stockPharmacie -= give;
      stockMovements.push({
        id: uuid(), type: 'exit', articleId: a.id, articleName: a.name, quantity: give,
        fromLocation: 'pharmacie', toLocation: 'patient', reason: `Délivrance ordonnance — ${patient.lastName}`,
        ref: consultId.slice(0, 8), date: deliveredAt, userId: phar.id, userName: phar.name,
      });
      pharmaDeliveryItems.push({
        id: uuid(), consultationId: consultId, patientId: patient.id,
        patientName: `${patient.lastName} ${patient.firstName}`, doctorName: doc.name,
        articleId: a.id, articleName: a.name, quantity: pr.quantity, unitPrice: pr.unitPrice,
        posology: pr.posology, deliveredAt, deliveredByUserId: phar.id, deliveredByName: phar.name,
        isExternal: false,
      });
    });
    addJourney(patient.id, deliveredAt, 'pharmacie', 'Médicaments délivrés', 'medications_delivered', { actorId: phar.id, actorName: phar.name, consultationId: consultId });
    patient.status = 'medications_delivered';
  } else if (prescriptions.length) {
    patient.status = paid ? 'invoice_paid' : 'consulted_awaiting_payment';
    notifications.push({
      id: uuid(), targetRole: 'pharmacy',
      message: `💊 Ordonnance non délivrée — ${patient.lastName} ${patient.firstName} (livraison en attente)`,
      type: 'warning', timestamp: date, read: false,
    });
  } else {
    patient.status = paid ? 'completed' : 'consulted_awaiting_payment';
  }
  patient.lastVisitAt = date;
  return { invoice, consultation, total, cashier };
}

/* ------------------------------------------------------------------ */
/* 5. Vente externe (sans dossier patient)                            */
/* ------------------------------------------------------------------ */
function venteExterne(date, paymentState) {
  const cashier = pick(U.cash);
  const clientName = `${pick(PRENOMS_M)} ${pick(NOMS)}`;
  const nb = randInt(1, 4);
  const items = [];
  const lines = [];
  for (let i = 0; i < nb; i++) {
    const useLab = rnd() < 0.4;
    if (useLab) {
      const ex = pick(LABS);
      items.push({ code: ex.code, description: ex.name, quantity: 1, unitPrice: ex.priceExterne, amount: ex.priceExterne, category: 'lab' });
      lines.push({ articleName: ex.name, quantity: 1, unitPrice: ex.priceExterne, discount: 0, category: 'lab' });
      labRequests.push({
        id: uuid(), examType: ex.name, code: ex.code, category: ex.category, parameters: ex.parameters,
        urgent: false, status: paymentState === 'paid' ? 'completed' : 'pending', sampleType: ex.sampleType,
        sampleReceived: paymentState === 'paid', requestedAt: date, requestedBy: U.lab.id, price: ex.priceExterne,
        results: paymentState === 'paid' ? labResults(ex.parameters) : undefined,
        completedAt: paymentState === 'paid' ? plusHours(date, ex.durationHours || 3) : undefined,
        completedBy: paymentState === 'paid' ? U.lab.id : undefined,
        labConclusion: paymentState === 'paid' ? 'Bilan dans les limites de la normale.' : undefined,
      });
    } else {
      const a = pick(MEDS);
      const q = randInt(1, 10);
      items.push({ code: a.id, description: a.name, quantity: q, unitPrice: a.priceExterne, amount: a.priceExterne * q, category: 'pharmacy' });
      lines.push({ articleId: a.id, articleName: a.name, quantity: q, unitPrice: a.priceExterne, discount: 0, category: 'pharmacy' });
      if (paymentState === 'paid') {
        const give = Math.min(q, a.stockPharmacie);
        a.stockPharmacie -= give;
        stockMovements.push({
          id: uuid(), type: 'exit', articleId: a.id, articleName: a.name, quantity: give,
          fromLocation: 'pharmacie', toLocation: 'client', reason: `Vente externe — ${clientName}`,
          date, userId: cashier.id, userName: cashier.name,
        });
      }
    }
  }
  const total = items.reduce((s, i) => s + i.amount, 0);
  const paid = paymentState === 'paid';
  const invoice = {
    id: uuid(), clientName, clientType: 'externe', items, totalAmount: total, patientCharge: total,
    status: paid ? 'paid' : 'pending', paidAt: paid ? date : undefined, paidBy: paid ? cashier.id : undefined,
    createdAt: date, isExternal: true,
  };
  invoices.push(invoice);
  const venteId = uuid();
  const montantPaye = paid ? total : paymentState === 'partiel' ? Math.round(total * 0.5) : 0;
  ventes.push({
    id: venteId, numeroFacture: mkFac(), type: 'externe', clientType: 'externe', clientName,
    subtotal: total, remisePct: 0, remiseMontant: 0, montantFacture: total, montantPaye,
    status: paid ? 'paid' : montantPaye > 0 ? 'partiel' : 'pending',
    isExterne: true, source: 'caisse', dateVente: date, datePaiement: montantPaye ? date : undefined,
    paidAt: paid ? date : undefined, createdBy: cashier.id, createdByName: cashier.name,
    paidBy: paid ? cashier.id : undefined, paidByName: paid ? cashier.name : undefined,
    createdAt: date, legacyInvoiceId: invoice.id,
  });
  lines.forEach((l) => venteLines.push({ id: uuid(), venteId, dateSort: dateOnly(date), ...l }));
  if (montantPaye > 0) ventePayments.push({ id: uuid(), venteId, amount: montantPaye, method: pick(['Espèces', 'Mobile Money']), date, paidBy: cashier.name, paidByUserId: cashier.id });
}

/* ------------------------------------------------------------------ */
/* 6. Hospitalisation / Bloc (paiements partiels)                     */
/* ------------------------------------------------------------------ */
const HOSP_ACTS = [
  { n: "Journée d'hospitalisation", p: 50000 },
  { n: 'Forfait maternité (accouchement)', p: 250000 },
  { n: 'Soins infirmiers quotidiens', p: 20000 },
  { n: 'Perfusion', p: 15000 },
];
const BLOC_ACTS = [
  { n: 'Intervention chirurgicale — appendicectomie', p: 450000 },
  { n: 'Césarienne', p: 600000 },
  { n: 'Petite chirurgie / suture', p: 90000 },
  { n: 'Anesthésie générale', p: 120000 },
];
function hbDossier(patient, mo, day, type, paymentState) {
  const openedAt = dayIso(mo, day, randInt(8, 12), 0);
  const cashier = pick(U.cash);
  const acts = type === 'hospit' ? HOSP_ACTS : BLOC_ACTS;
  const nb = randInt(2, 4);
  const lines = [];
  for (let i = 0; i < nb; i++) {
    const act = pick(acts);
    const q = act.p > 200000 ? 1 : randInt(1, 4);
    const up = patient.clientType === 'societe' ? Math.round(act.p * 0.9) : act.p;
    lines.push({ id: uuid(), articleName: act.n, quantity: q, unitPrice: up, discount: 0, dateSort: dateOnly(openedAt) });
  }
  const total = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const payments = [];
  if (paymentState === 'paid') {
    payments.push({ amount: total, paidBy: cashier.name, date: plusHours(openedAt, 6), paidByUserId: cashier.id, receivedBy: 'caisse' });
  } else if (paymentState === 'partiel') {
    const n = randInt(1, 2);
    let rest = Math.round(total * (0.35 + rnd() * 0.3));
    for (let i = 0; i < n; i++) {
      const amt = i === n - 1 ? rest : Math.round(rest / 2);
      rest -= amt;
      payments.push({ amount: amt, paidBy: cashier.name, date: plusHours(openedAt, 6 + i * 24), paidByUserId: cashier.id, receivedBy: i % 2 ? 'pharmacie' : 'caisse' });
    }
  }
  const rec = {
    id: uuid(), patientId: patient.id, patientName: `${patient.lastName} ${patient.firstName}`,
    clientType: patient.clientType, company: patient.company, type, lines, payments,
    openedAt, openedBy: cashier.name, openedByUserId: cashier.id,
  };
  hbRecords.push(rec);

  const venteId = uuid();
  const paye = payments.reduce((s, p) => s + p.amount, 0);
  ventes.push({
    id: venteId, patientId: patient.id, numeroFacture: mkFac(),
    type: type === 'hospit' ? 'hospitalisation' : 'bloc', clientType: patient.clientType,
    clientName: rec.patientName, company: patient.company,
    subtotal: total, remisePct: 0, remiseMontant: 0, montantFacture: total, montantPaye: paye,
    status: paye >= total ? 'paid' : paye > 0 ? 'partiel' : 'pending',
    isExterne: false, source: 'caisse', dateVente: openedAt,
    datePaiement: payments[0]?.date, paidAt: paye >= total ? payments[payments.length - 1]?.date : undefined,
    createdBy: cashier.id, createdByName: cashier.name, createdAt: openedAt, legacyHbRecordId: rec.id,
  });
  lines.forEach((l) => venteLines.push({
    id: uuid(), venteId, articleName: l.articleName, quantity: l.quantity, unitPrice: l.unitPrice,
    discount: 0, category: type === 'hospit' ? 'hospitalization' : 'bloc', dateSort: l.dateSort,
  }));
  payments.forEach((p) => ventePayments.push({
    id: uuid(), venteId, amount: p.amount, method: pick(['Espèces', 'Mobile Money', 'Virement']),
    date: p.date, paidBy: p.paidBy, paidByUserId: p.paidByUserId,
  }));
  addJourney(patient.id, openedAt, type === 'hospit' ? 'hospitalisation' : 'bloc',
    type === 'hospit' ? 'Admission en hospitalisation' : 'Passage au bloc opératoire', 'in_consultation',
    { actorId: cashier.id, actorName: cashier.name });
}

/* ================================================================== */
/* GÉNÉRATION                                                         */
/* ================================================================== */

/* --- Roster patients : 8 salariés / société + 24 patients comptoir --- */
const roster = {};
companies.forEach((c) => {
  roster[c.name] = [];
  for (let i = 0; i < 8; i++) roster[c.name].push(makePatient('societe', c, iso(2026, 5, randInt(5, 28), 9)));
});
const comptoirPool = [];
for (let i = 0; i < 24; i++) comptoirPool.push(makePatient('comptoir', null, iso(2026, 5, randInt(5, 28), 10)));

/* --- Stock initial : approvisionnement d'ouverture --- */
articles.forEach((a) => {
  if (a.family === 'MEDIC') a.stockPharmacie = randInt(40, 120);
});

/* --- Boucle mensuelle --- */
MONTHS.forEach((mo, mIdx) => {
  /* 1) Achats : ~8 BL par mois */
  for (let i = 0; i < 8; i++) achat(mo, randInt(1, mo.days));

  /* 2) Livraisons : 14 livrées + 4 en attente (non livrées) */
  for (let i = 0; i < 14; i++) transfert(mo, randInt(1, mo.days), { livre: true });
  for (let i = 0; i < 4; i++) transfert(mo, randInt(Math.max(1, mo.days - 12), mo.days), { livre: false });

  /* 3) Activité clinique quotidienne */
  for (let d = 1; d <= mo.days; d++) {
    const wd = new Date(Date.UTC(mo.y, mo.m - 1, d)).getUTCDay();
    if (wd === 0) continue; // dimanche fermé
    const nbVisits = wd === 6 ? randInt(2, 4) : randInt(5, 9);

    for (let v = 0; v < nbVisits; v++) {
      const date = dayIso(mo, d, randInt(7, 17), randInt(0, 59));
      const r = rnd();
      if (r < 0.15) { // vente externe
        const st = rnd() < 0.8 ? 'paid' : rnd() < 0.5 ? 'pending' : 'partiel';
        venteExterne(date, st);
        continue;
      }
      const isSoc = r < 0.5;
      let patient;
      if (isSoc) {
        const comp = pick(companies);
        patient = pick(roster[comp.name]);
      } else {
        patient = rnd() < 0.7 ? pick(comptoirPool) : makePatient('comptoir', null, date);
      }
      /* état de paiement : sociétés = crédit (réglé via compte mensuel) */
      let paymentState;
      if (patient.clientType === 'societe') paymentState = 'paid';
      else {
        const p = rnd();
        paymentState = p < 0.78 ? 'paid' : p < 0.91 ? 'pending' : 'partiel';
      }
      const l = rnd();
      const labState = l < 0.74 ? 'completed' : l < 0.84 ? 'in_progress' : l < 0.92 ? 'sample_received' : 'pending';
      const deliverMeds = rnd() < 0.8;
      episode(patient, date, { paymentState, labState, deliverMeds });
    }

    /* 4) Hospitalisation / bloc : quelques dossiers par mois */
    if (rnd() < 0.12) {
      const pat = rnd() < 0.5 ? pick(comptoirPool) : pick(roster[pick(companies).name]);
      const type = rnd() < 0.65 ? 'hospit' : 'bloc';
      const st = rnd() < 0.35 ? 'paid' : rnd() < 0.75 ? 'partiel' : 'pending';
      hbDossier(pat, mo, d, type, st);
    }
  }

  /* 5) Inventaire mensuel du dépôt central */
  const invDate = dayIso(mo, mo.days, 16, 0);
  const invLines = STOCK_ARTICLES.slice(0, 12).map((a) => {
    const theo = a.stockCentral;
    const counted = rnd() < 0.75 ? theo : Math.max(0, theo + randInt(-6, 4));
    return { articleId: a.id, articleName: a.name, theoreticalQty: theo, countedQty: counted, difference: counted - theo };
  });
  inventorySessions.push({
    id: uuid(), location: 'central', locationLabel: 'Dépôt central', status: 'completed',
    startedAt: invDate, completedAt: plusHours(invDate, 2), startedBy: U.mag.id, startedByName: U.mag.name,
    lines: invLines, notes: `Inventaire mensuel ${mo.label}`,
  });
  invLines.forEach((l) => {
    if (l.difference === 0) return;
    const a = artById[l.articleId];
    a.stockCentral = l.countedQty;
    stockMovements.push({
      id: uuid(), type: 'inventory_adjust', articleId: a.id, articleName: a.name,
      quantity: Math.abs(l.difference), fromLocation: 'central', toLocation: 'central',
      reason: `Ajustement inventaire ${mo.label} (${l.difference > 0 ? '+' : ''}${l.difference})`,
      date: plusHours(invDate, 2), userId: U.mag.id, userName: U.mag.name,
    });
  });
  log('INVENTAIRE', `Inventaire dépôt central ${mo.label} — ${invLines.length} articles comptés`, plusHours(invDate, 2), U.mag);
});

/* ------------------------------------------------------------------ */
/* 7. Clôtures de caisse (Z) journalières                             */
/* ------------------------------------------------------------------ */
const paidByDay = {};
invoices.filter((i) => i.status === 'paid' && !i.creditSociete).forEach((i) => {
  const k = dateOnly(i.paidAt);
  (paidByDay[k] = paidByDay[k] || []).push(i);
});
Object.keys(paidByDay).sort().forEach((day) => {
  const list = paidByDay[day];
  // le dernier jour du dataset reste "ouvert" pour permettre une clôture en démo
  if (day === '2026-08-31') return;
  const cashier = pick(U.cash);
  const closingId = uuid();
  const consultationTotal = list.filter((i) => !i.isExternal).reduce((s, i) => s + i.totalAmount, 0);
  const externalTotal = list.filter((i) => i.isExternal).reduce((s, i) => s + i.totalAmount, 0);
  const hospTotal = hbRecords.reduce((s, h) => s + h.payments.filter((p) => dateOnly(p.date) === day).reduce((ss, p) => ss + p.amount, 0), 0);
  cashClosings.push({
    id: closingId, date: `${day}T18:30:00.000Z`, cashierId: cashier.id, cashierName: cashier.name,
    invoiceIds: list.map((i) => i.id), invoiceCount: list.length,
    consultationTotal, externalTotal, hospitalizationTotal: hospTotal,
    grandTotal: consultationTotal + externalTotal + hospTotal, createdAt: `${day}T18:30:00.000Z`,
  });
  list.forEach((i) => { i.closingId = closingId; });
  ventes.forEach((v) => { if (v.legacyInvoiceId && list.some((i) => i.id === v.legacyInvoiceId)) v.closingId = closingId; });
  log('CLOTURE_CAISSE', `Z ${closingId.slice(0, 8).toUpperCase()} — ${list.length} facture(s), ${(consultationTotal + externalTotal + hospTotal).toLocaleString('fr-FR')} Ar`, `${day}T18:30:00.000Z`, cashier);
});

/* ------------------------------------------------------------------ */
/* 8. Clôtures de garde pharmacie (mensuelles)                        */
/* ------------------------------------------------------------------ */
let phaCounter = 0;
MONTHS.forEach((mo) => {
  const items = pharmaDeliveryItems.filter((d) => monthOf(d.deliveredAt) === mo.key && !d.closingId);
  if (!items.length) return;
  const closingId = uuid();
  const resp = pick(U.pha);
  const date = dayIso(mo, mo.days, 19, 0);
  const acc = new Map();
  items.forEach((d) => {
    const cur = acc.get(d.articleId);
    if (cur) cur.qtyOut += d.quantity;
    else acc.set(d.articleId, { articleId: d.articleId, articleName: d.articleName, qtyOut: d.quantity, finalStock: artById[d.articleId]?.stockPharmacie ?? 0 });
  });
  items.forEach((d) => { d.closingId = closingId; });
  phaCounter++;
  pharmaDeliveryClosings.push({
    id: closingId, closingNumber: `LIV-2026-${String(phaCounter).padStart(4, '0')}`, date,
    responsibleId: resp.id, responsibleName: resp.name, deliveryIds: items.map((d) => d.id),
    totalItems: items.reduce((s, d) => s + d.quantity, 0),
    totalAmount: items.reduce((s, d) => s + d.quantity * d.unitPrice, 0),
    deliveries: items.map((d) => ({ ...d })),
    stockSummary: Array.from(acc.values()).sort((a, b) => b.qtyOut - a.qtyOut),
    createdAt: date, notes: `Compilation des livraisons ${mo.label}`,
  });
  log('CLOTURE_LIVRAISONS_PHARMA', `Clôture garde LIV-2026-${String(phaCounter).padStart(4, '0')} — ${items.length} lignes`, date, resp);
});

/* ------------------------------------------------------------------ */
/* 9. Comptes mensuels sociétés (soldés / partiels / IMPAYÉS)         */
/* ------------------------------------------------------------------ */
/* Matrice volontairement mixte pour l'analyse des créances */
const SETTLE = {
  0: ['paid', 'paid', 'partial'],   // société 1
  1: ['paid', 'partial', 'open'],   // société 2
  2: ['paid', 'open', 'open'],      // société 3
  3: ['partial', 'open', 'open'],   // société 4
};
companies.forEach((company, ci) => {
  MONTHS.forEach((mo, mi) => {
    const monthInvs = invoices.filter((i) =>
      i.clientType === 'societe' && i.creditSociete && monthOf(i.createdAt) === mo.key &&
      patients.find((p) => p.id === i.patientId)?.company === company.name);
    if (!monthInvs.length) return;
    const totalAmount = monthInvs.reduce((s, i) => s + i.totalAmount, 0);
    const target = (SETTLE[ci] || ['open', 'open', 'open'])[mi];
    const payDate = iso(2026, mo.m === 12 ? 12 : mo.m + 1, 10, 11);
    const ref = `VIR-${company.name.slice(0, 3).toUpperCase()}-${mo.key.replace('-', '')}`;
    let paidAmount = 0;
    const payments = [];
    if (target === 'paid') {
      paidAmount = totalAmount;
      payments.push({ id: uuid(), amount: totalAmount, date: payDate, method: 'Virement', reference: ref, invoiceIds: monthInvs.map((i) => i.id), receivedBy: U.bil.name, receivedByUserId: U.bil.id });
    } else if (target === 'partial') {
      paidAmount = Math.round(totalAmount * (0.35 + rnd() * 0.3));
      payments.push({ id: uuid(), amount: paidAmount, date: payDate, method: 'Virement', reference: ref + '-A', invoiceIds: monthInvs.slice(0, Math.ceil(monthInvs.length / 2)).map((i) => i.id), receivedBy: U.bil.name, receivedByUserId: U.bil.id, observation: 'Acompte partiel' });
    }
    const account = {
      id: uuid(), company: company.name, month: mo.key, invoiceIds: monthInvs.map((i) => i.id),
      totalAmount, paidAmount, status: target, createdAt: iso(2026, mo.m, mo.days, 17),
      payments,
    };
    if (target === 'paid') {
      Object.assign(account, {
        finalSettlementAmount: totalAmount, finalSettlementDate: payDate, finalSettlementMethod: 'Virement',
        finalSettlementReference: ref, finalSettlementObservation: 'Règlement global mensuel',
        settledBy: U.bil.id, settledByName: U.bil.name,
      });
      log('REGLEMENT_SOCIETE', `${company.name} — ${mo.label} soldé : ${totalAmount.toLocaleString('fr-FR')} Ar`, payDate, U.bil);
    } else if (target === 'partial') {
      log('REGLEMENT_SOCIETE_PARTIEL', `${company.name} — ${mo.label} : acompte ${paidAmount.toLocaleString('fr-FR')} Ar / ${totalAmount.toLocaleString('fr-FR')} Ar`, payDate, U.bil);
    }
    companyBillingAccounts.push(account);
  });
});

/* ------------------------------------------------------------------ */
/* 10. Alertes de stock cohérentes + messagerie                       */
/* ------------------------------------------------------------------ */
articles.forEach((a) => {
  if (a.purchasePrice <= 0) return;
  if (a.stockPharmacie <= a.minStockPharmacie) {
    notifications.push({
      id: uuid(), targetRole: 'pharmacy',
      message: `⚠️ Stock bas en pharmacie : ${a.name} (${a.stockPharmacie} restant)`,
      type: a.stockPharmacie <= 0 ? 'critical' : 'warning',
      timestamp: iso(2026, 8, 30, 8), read: false,
    });
  }
  if (a.stockCentral <= a.minStockCentral) {
    notifications.push({
      id: uuid(), targetRole: 'magasinier',
      message: `⚠️ Réapprovisionnement dépôt central requis : ${a.name} (${a.stockCentral})`,
      type: a.stockCentral <= 0 ? 'critical' : 'warning',
      timestamp: iso(2026, 8, 30, 8), read: false,
    });
  }
});
messages.push(
  { id: uuid(), from: U.mag.id, fromName: U.mag.name, to: 'pharmacy', subject: 'Réapprovisionnement', content: 'Les demandes en attente seront livrées début septembre.', timestamp: iso(2026, 8, 29, 15), read: false },
  { id: uuid(), from: U.bil.id, fromName: U.bil.name, to: 'admin', subject: 'Créances sociétés', content: 'Plusieurs mois restent impayés côté sociétés conventionnées, relance en cours.', timestamp: iso(2026, 8, 31, 10), read: false },
);

/* ------------------------------------------------------------------ */
/* 11. Écriture de la base                                            */
/* ------------------------------------------------------------------ */
const out = {
  currentUser: null,
  ticketSettings: base.ticketSettings,
  etablissements: base.etablissements,
  users,
  companies,
  articles,
  fournisseurs,
  familles,
  labCatalog,
  warehouseServices: services,
  patients,
  consultations,
  invoices,
  ventes,
  venteLines,
  ventePayments,
  cashClosings,
  stockTransfers,
  stockEntries,
  stockMovements,
  movementHeaders,
  movementLines,
  inventorySessions,
  pharmaDeliveryItems,
  pharmaDeliveryClosings,
  pharmaClosingCounter: phaCounter,
  hbRecords,
  companyBillingAccounts,
  journey: journey.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  labRequests,
  auditLogs: auditLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  notifications: notifications.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  messages,
  factureCounter: facSeq,
};
fs.writeFileSync(FILE, JSON.stringify(out, null, 2), 'utf-8');

/* ------------------------------------------------------------------ */
/* Synthèse console                                                   */
/* ------------------------------------------------------------------ */
const f = (n) => Math.round(n).toLocaleString('fr-FR');
console.log('\n================ BASE RÉINITIALISÉE — 3 MOIS ================');
MONTHS.forEach((mo) => {
  const inv = invoices.filter((i) => monthOf(i.createdAt) === mo.key);
  const ca = inv.reduce((s, i) => s + i.totalAmount, 0);
  const impaye = inv.filter((i) => i.status === 'pending').reduce((s, i) => s + i.totalAmount, 0);
  const ach = stockEntries.filter((e) => monthOf(e.date) === mo.key).reduce((s, e) => s + e.quantity * e.purchasePrice, 0);
  console.log(`${mo.label.padEnd(13)} · factures ${String(inv.length).padStart(3)} · CA ${f(ca).padStart(12)} Ar · impayé ${f(impaye).padStart(11)} Ar · achats ${f(ach).padStart(12)} Ar`);
});
console.log('-------------------------------------------------------------');
console.log(`Patients                : ${patients.length}`);
console.log(`Consultations           : ${consultations.length}`);
console.log(`Factures                : ${invoices.length}  (payées ${invoices.filter(i => i.status === 'paid').length} · impayées ${invoices.filter(i => i.status === 'pending').length})`);
console.log(`Ventes                  : ${ventes.length}  (payées ${ventes.filter(v => v.status === 'paid').length} · partielles ${ventes.filter(v => v.status === 'partiel').length} · non payées ${ventes.filter(v => v.status === 'pending').length})`);
console.log(`Analyses labo           : ${labRequests.length}  (terminées ${labRequests.filter(l => l.status === 'completed').length} · en cours ${labRequests.filter(l => l.status === 'in_progress').length} · prélèv. reçu ${labRequests.filter(l => l.status === 'sample_received').length} · en attente ${labRequests.filter(l => l.status === 'pending').length})`);
console.log(`Achats (BL)             : ${movementHeaders.filter(h => h.type === 'achat').length} · lignes d'entrée ${stockEntries.length}`);
console.log(`Livraisons/transferts   : ${stockTransfers.length}  (livrés ${stockTransfers.filter(t => t.status === 'transferred').length} · NON LIVRÉS ${stockTransfers.filter(t => t.status === 'requested').length})`);
console.log(`Ordonnances délivrées   : ${pharmaDeliveryItems.length} lignes · clôtures pharma ${pharmaDeliveryClosings.length}`);
console.log(`Hospit / Bloc           : ${hbRecords.length} dossiers (soldés ${hbRecords.filter(h => h.payments.reduce((s, p) => s + p.amount, 0) >= h.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)).length})`);
console.log(`Clôtures de caisse (Z)  : ${cashClosings.length}`);
console.log(`Comptes sociétés        : ${companyBillingAccounts.length} (soldés ${companyBillingAccounts.filter(a => a.status === 'paid').length} · partiels ${companyBillingAccounts.filter(a => a.status === 'partial').length} · IMPAYÉS ${companyBillingAccounts.filter(a => a.status === 'open').length})`);
const creance = companyBillingAccounts.reduce((s, a) => s + (a.totalAmount - a.paidAmount), 0);
console.log(`Créances sociétés       : ${f(creance)} Ar`);
console.log(`Mouvements de stock     : ${stockMovements.length} · inventaires ${inventorySessions.length}`);
console.log(`Parcours patients       : ${journey.length} événements · journal ${auditLogs.length} entrées`);
console.log('=============================================================\n');
