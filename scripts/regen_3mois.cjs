#!/usr/bin/env node
/**
 * Régénération COMPLÈTE des données de démonstration sur les 3 derniers mois
 * (17/06/2026 → 16/09/2026, se termine aujourd'hui).
 *
 * - Les FAMILLES sont réécrites depuis le catalogue par défaut (Consultation et
 *   Autres incluses) et SEULS LES MÉDICAMENTS sont gérés en stock.
 * - TOUTE vente est rattachée à une famille et TOUT article vendu appartient à
 *   une famille (celle de son article au catalogue, sinon celle de sa catégorie,
 *   sinon « Autres »).
 *
 * - Les tables de RÉFÉRENCE sont conservées (utilisateurs, sociétés, articles,
 *   familles, catalogue labo, établissements, fournisseurs, services dépôt).
 * - Toutes les tables TRANSACTIONNELLES sont supprimées puis regénérées de
 *   zéro : patients, consultations, factures, ventes, paiements, clôtures,
 *   parcours, laboratoire, pharmacie (délivrances), stock, hospit/bloc,
 *   comptes de facturation société, audit, notifications, messages.
 *
 * Usage : node scripts/regen_3mois.js
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'src', 'data', 'localData.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));

// ---------------------------------------------------------------- RNG ----
let seed = 20260915;
function rnd() { // mulberry32
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
function uuid() {
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) { s += '-'; continue; }
    s += h[Math.floor(rnd() * 16)];
  }
  return s;
}
const short = (id) => id.split('-')[0];
const round50 = (n) => Math.round(n / 50) * 50;

// ------------------------------------------------------------- fenêtre ----
const START = new Date(Date.UTC(2026, 5, 23)); // 23/06/2026 (~3 mois)
const END = new Date(Date.UTC(2026, 8, 22));   // 22/09/2026 (aujourd'hui)
const days = [];
for (let d = new Date(START); d <= END; d.setUTCDate(d.getUTCDate() + 1)) {
  if (d.getUTCDay() !== 0) days.push(new Date(d)); // fermé le dimanche
}
const iso = (d) => d.toISOString();
const ymd = (d) => d.toISOString().slice(0, 10);
const monthKey = (d) => ymd(d).slice(0, 7);
const atHour = (day, h, m) => { const x = new Date(day); x.setUTCHours(h, m, int(0, 59), 0); return x; };
const addMin = (d, min) => new Date(d.getTime() + min * 60000);
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const MOIS_FR = { '06': 'Juin', '07': 'Juillet', '08': 'Août', '09': 'Septembre' };

// ---------------------------------------------------------- références ----
const users = data.users;
const U = (id) => users.find(u => u.id === id);
const doctors = users.filter(u => u.role === 'doctor');
const cashiers = users.filter(u => u.role === 'cashier');
const U_BIL = U('USR-BIL'), U_REC = U('USR-REC'), U_MAG = U('USR-MAG'), U_LAB = U('USR-LAB');
const pharmas = users.filter(u => u.role === 'pharmacy');
const companies = data.companies.map(c => c.name);
const articles = data.articles;

// ------------------------------------------------------------- familles ----
// Catalogue IDENTIQUE à DEFAULT_FAMILLES (src/store.ts) : SEULS LES MÉDICAMENTS
// sont gérés en stock ; consultation, laboratoire, échographie, hospitalisation,
// dentaire et « autres » sont des actes / services sans stock.
const FAMILLES = [
  { id: 'fam-medic', code: 'MEDIC', name: 'Médicaments', color: '#0D47A1', order: 1, manageStock: true },
  { id: 'fam-consult', code: 'CONSULT', name: 'Consultation', color: '#0EA5E9', order: 2, manageStock: false },
  { id: 'fam-labo', code: 'LABO', name: 'Laboratoire', color: '#10B981', order: 3, manageStock: false },
  { id: 'fam-echo', code: 'ECHO', name: 'Échographie', color: '#F59E0B', order: 4, manageStock: false },
  { id: 'fam-hosp', code: 'HOSP', name: 'Hospitalisation', color: '#F97316', order: 5, manageStock: false },
  { id: 'fam-dent', code: 'DENT', name: 'Dentaire', color: '#8B5CF6', order: 6, manageStock: false },
  { id: 'fam-autres', code: 'AUTRES', name: 'Autres', color: '#64748B', order: 7, manageStock: false },
];
const FAMILLE_AUTRES = 'AUTRES';
const FAMILLE_PAR_CATEGORIE = {
  pharmacy: 'MEDIC', medicament: 'MEDIC', lab: 'LABO', labo: 'LABO', echo: 'ECHO',
  consultation: 'CONSULT', consult: 'CONSULT', surgery: 'HOSP', hospitalization: 'HOSP',
  hospitalisation: 'HOSP', bloc: 'HOSP', externe: FAMILLE_AUTRES,
};
const normFam = (c) => String(c || '').trim().toUpperCase();
const gereStock = (c) => {
  const f = FAMILLES.find(x => x.code === normFam(c));
  return f ? f.manageStock === true : normFam(c) === 'MEDIC';
};
// Chaque article appartient à une famille (repli : « Autres »).
articles.forEach(a => { a.family = normFam(a.family) || FAMILLE_AUTRES; });
const articleParNom = (nom) => {
  const n = String(nom || '').trim().toLowerCase();
  return n ? articles.find(a => String(a.name || '').trim().toLowerCase() === n) : undefined;
};
/** Famille d'une ligne vendue : celle de l'article, sinon celle de sa catégorie. */
const familleLigne = (articleName, category, deja) => {
  if (normFam(deja)) return normFam(deja);
  const art = articleParNom(articleName);
  if (art) return art.family;
  return FAMILLE_PAR_CATEGORIE[String(category || '').trim().toLowerCase()] || FAMILLE_AUTRES;
};
/**
 * Famille d'une vente : commune à ses lignes, sinon la famille DOMINANTE
 * (montant, puis nombre de lignes, puis ordre du catalogue) — « Autres » ne sert
 * qu'aux éléments non classés.
 */
const familleVente = (lignes) => {
  if (!lignes.length) return FAMILLE_AUTRES;
  const ordre = (code) => { const i = FAMILLES.findIndex(f => f.code === code); return i < 0 ? FAMILLES.length : i; };
  const poids = new Map();
  for (const l of lignes) {
    const f = familleLigne(l.articleName, l.category, l.family);
    const p = poids.get(f) || { montant: 0, lignes: 0 };
    p.montant += Math.max(0, Number(l.amount ?? ((l.quantity || 0) * (l.unitPrice || 0)) * (1 - (l.discount || 0) / 100)));
    p.lignes += 1;
    poids.set(f, p);
  }
  if (poids.size === 1) return [...poids.keys()][0];
  return [...poids.entries()].sort((a, b) =>
    b[1].montant - a[1].montant || b[1].lignes - a[1].lignes || ordre(a[0]) - ordre(b[0]))[0][0];
};

const medicArticles = articles.filter(a => a.family === 'MEDIC' && !a.saleBlocked);
const echoArticles = articles.filter(a => a.family === 'ECHO');
const labCatalog = data.labCatalog;
const fournisseurs = data.fournisseurs.map(f => f.name);
const services = data.warehouseServices;

// ------------------------------------------------------------- libellés ---
const NOMS = ['RAKOTONIRINA', 'RAZAFINDRAKOTO', 'ANDRIANARISOA', 'RABEMANANJARA', 'RANDRIAMAMONJY', 'RASOLOFOARIVONY', 'RAKOTOMALALA', 'RAZANADRAKOTO', 'ANDRIAMAHASOA', 'RAHARINIRINA', 'RAKOTOARIMANANA', 'RAZAFIMAHEFA', 'ANDRIAMAHEFA', 'RAKOTOZAFY', 'RAHARISOA', 'RAJAONARISON', 'RAKOTONDRAZAKA', 'RAVELOMANANA', 'ANDRIATIANA', 'RAZAFINDRALAMBO'];
const PRENOMS = ['Nirina', 'Miora', 'Hery', 'Toky', 'Lova', 'Faniry', 'Aina', 'Tiana', 'Sitraka', 'Voahangy', 'Fara', 'Hanta', 'Zo', 'Mamy', 'Rija', 'Tsiky', 'Fetra', 'Lalao', 'Feno', 'Mika', 'Solange', 'Judicaël', 'Hasina', 'Toky', 'Ony', 'Rado', 'Vola', 'Nomena', 'Fetra', 'Tahiry'];
const QUARTIERS = ['AMPANDRANA, ANTANANARIVO', 'ANALAKELY, ANTANANARIVO', 'ISOTRY, ANTANANARIVO', '67HA, ANTANANARIVO', 'ANOSIBE, ANTANANARIVO', 'BEHORIZATRA, ANTANANARIVO', 'TSARALALANA, ANTANANARIVO', 'ANDOHARANOFOTSITANY', 'AMBOHIMANARINA, ANTANANARIVO', 'ITARIOSY, ANTANANARIVO'];
const MOTIFS = ['Fièvre et frissons', 'Maux de gorge', 'Céphalées persistantes', 'Douleurs abdominales', 'Toux productive', 'Hypertension — contrôle', 'Diabète — suivi', 'Paludisme suspecté', 'Éruption cutanée', 'Traumatisme du poignet', 'Lombalgie', 'Consultation prénatale', 'Asthme — contrôle', 'Infection urinaire', 'Asthénie'];
const DIAGS = [
  'Paludisme simple confirmé, traitement Coartem.',
  'Angine virale, traitement symptomatique.',
  'Hypertension artérielle stade 1, règles hygiéno-diététiques.',
  'Diabète de type 2 équilibré, poursuite du traitement.',
  'Gastro-entérite aiguë, réhydratation orale.',
  'Anémie légère, supplémentation martiale.',
  'Infection urinaire basse, antibiopérapie.',
  'Lombalgie commune, AINS et repos.',
  'Céphalées de tension, paracétamol.',
  'Suspicion typhoïde, bilan biologique demandé.',
  'Asthme léger, traitement de fond.',
  'Grossesse évolutive, suivi prénatal.',
];
const POSO = ['1 gélule x 2/jour', '1 comprimé x 3/jour', '1 sachet matin et soir', '1 ampoule x 1/jour', '2 comprimés en prise unique', '1 cuillère à soupe x 2/jour'];
const CONCLUSIONS_LAB = ['Bilan dans les limites de la normale.', 'Résultats conformes, pas d\'anomalie décelée.', 'Valeurs légèrement basses, contrôle conseillé.', 'Bilan compatible avec le diagnostic clinique.'];
const HB_HOSPIT = [
  { n: 'Journée d\'hospitalisation', p: 45000 },
  { n: 'Perfusion', p: 13500 },
  { n: 'Soins infirmiers quotidiens', p: 18000 },
];
const HB_BLOC = [
  { n: 'Césarienne', p: 600000 },
  { n: 'Intervention chirurgicale — appendicectomie', p: 450000 },
  { n: 'Petite chirurgie / suture', p: 90000 },
];

const prixDe = (a, type) => type === 'societe' ? a.priceSociete : type === 'externe' ? a.priceExterne : a.priceComptoir;
const prixLab = (e, type) => type === 'societe' ? e.priceSociete : type === 'externe' ? e.priceExterne : e.priceComptoir;
const prixCons = (spec, type) => spec ? (type === 'societe' ? 22500 : 25000) : (type === 'societe' ? 13500 : 15000);

// ------------------------------------------------------- nouvelles tables -
const patients = [], consultations = [], invoices = [], ventes = [], venteLines = [],
  ventePayments = [], cashClosings = [], stockTransfers = [], stockEntries = [],
  stockMovements = [], movementHeaders = [], movementLines = [], inventorySessions = [],
  pharmaDeliveryItems = [], pharmaDeliveryClosings = [], hbRecords = [],
  companyBillingAccounts = [], journey = [], labRequests = [], auditLogs = [],
  notifications = [], messages = [];

const dailyCounts = {};
function numeroFacture(d) {
  const dt = d ? new Date(d) : new Date();
  const yy = String(dt.getUTCFullYear() % 100).padStart(2, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const key = `${yy}${mm}${dd}`;
  dailyCounts[key] = (dailyCounts[key] || 0) + 1;
  const seq = String(dailyCounts[key]).padStart(3, '0');
  return `${yy}FA${mm}${dd}${seq}`;
}

const audit = (ts, u, action, details) => auditLogs.push({
  id: uuid(), timestamp: iso(ts), userId: u.id, userName: u.name, userRole: u.role, action, details,
});

// ------------------------------------------------------------ patients ----
let dossierSeq = 1000;
function nouveauPatient(clientType, company, registeredAt) {
  const gender = chance(0.52) ? 'M' : 'F';
  const firstName = pick(PRENOMS).toUpperCase();
  const lastName = pick(NOMS);
  const birthYear = int(1958, 2018);
  const age = Math.max(1, 2026 - birthYear);
  const p = {
    id: uuid(),
    dossier: `PAT${++dossierSeq}`,
    firstName, lastName,
    dateOfBirth: `${birthYear}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
    age: `${age} Ans`,
    gender,
    address: pick(QUARTIERS),
    contact: `03${pick(['2', '4'])} ${int(10, 99)} ${int(100, 999)} ${int(10, 99)}`,
    ssn: '',
    clientType,
    allergies: [], chronicTreatments: [], antecedents: [],
    bloodGroup: pick(['O+', 'O-', 'A+', 'A-', 'B+', 'AB+', 'B-']),
    registeredAt: iso(registeredAt),
    registeredBy: 'USR-REC',
    status: 'completed',
  };
  if (clientType === 'societe') {
    p.company = company;
    p.matricule = `MAT-${company.slice(0, 4)}${int(1000, 9999)}`;
    p.insureName = company;
  }
  p.lastVisitAt = iso(registeredAt);
  patients.push(p);
  journey.push({
    id: uuid(), patientId: p.id, timestamp: iso(registeredAt),
    department: 'reception', action: 'Dossier patient créé', status: 'registered',
    actorId: U_REC.id, actorName: U_REC.name,
  });
  return p;
}

// 32 assurés société (8 par société) + base comptoir
for (const co of companies) for (let i = 0; i < 8; i++) nouveauPatient('societe', co, addDays(START, -int(20, 200)));
for (let i = 0; i < 110; i++) nouveauPatient('comptoir', null, addDays(START, -int(5, 300)));

// --------------------------------------------------- générateur de visite -
const parMoisSociete = {}; // monthKey -> company -> [invoiceIds]
// Buckets journaliers pour les clôtures de caisse : ymd -> cashierId -> [ids]
const bucketFactures = new Map(); // facture (consultation ou externe)
const bucketHb = new Map();       // hospit/bloc
const pushBucket = (map, jour, cashierId, valeur) => {
  if (!map.has(jour)) map.set(jour, new Map());
  const parCaissier = map.get(jour);
  if (!parCaissier.has(cashierId)) parCaissier.set(cashierId, []);
  parCaissier.get(cashierId).push(valeur);
};

function genererVisite(day) {
  const createdAt = atHour(day, int(8, 15), int(0, 59));
  const estSociete = chance(0.42);
  let patient;
  if (estSociete) {
    patient = pick(patients.filter(p => p.clientType === 'societe'));
  } else if (chance(0.12) && patients.length < 260) {
    patient = nouveauPatient('comptoir', null, createdAt);
  } else {
    patient = pick(patients.filter(p => p.clientType === 'comptoir'));
  }
  const clientType = patient.clientType; // 'societe' | 'comptoir'
  const doctor = pick(doctors);
  const consultDate = addMin(createdAt, int(10, 40));
  patient.lastVisitAt = iso(consultDate);
  const clientName = `${patient.lastName} ${patient.firstName}`;

  // Actes
  const spec = chance(0.3);
  const consPrix = prixCons(spec, clientType);
  const items = [{ code: 'CONS', description: spec ? 'Consultation Spécialiste' : 'Consultation Générale', quantity: 1, unitPrice: consPrix, amount: consPrix, category: 'consultation' }];
  const prescriptions = [];
  const consultLabRequests = [];
  const consultEchoRequests = [];

  // Médicaments prescrits (0 à 3)
  const nbMed = int(0, 3);
  for (let i = 0; i < nbMed; i++) {
    const art = pick(medicArticles);
    if (items.some(x => x.code === art.id)) continue;
    const qty = int(1, 12);
    const up = prixDe(art, clientType);
    items.push({ code: art.id, description: art.name, quantity: qty, unitPrice: up, amount: up * qty, category: 'pharmacy' });
    prescriptions.push({
      id: uuid(), articleId: art.id, articleName: art.name, quantity: qty,
      posology: pick(POSO), duration: `${int(3, 10)} jours`, instructions: chance(0.4) ? 'À prendre après les repas' : '',
      unitPrice: up, discount: 0, delivered: false,
    });
  }

  // Analyses (40 %)
  if (chance(0.4)) {
    const nbLab = int(1, 2);
    for (let i = 0; i < nbLab; i++) {
      const ex = pick(labCatalog);
      if (items.some(x => x.code === ex.code)) continue;
      const up = prixLab(ex, clientType);
      items.push({ code: ex.code, description: ex.name, quantity: 1, unitPrice: up, amount: up, category: 'lab' });
    }
  }

  // Échographie (15 %)
  if (chance(0.15)) {
    const ex = pick(echoArticles);
    const up = prixDe(ex, clientType);
    items.push({ code: ex.id, description: ex.name, quantity: 1, unitPrice: up, amount: up, category: 'echo' });
  }

  const totalAmount = items.reduce((s, i) => s + i.amount, 0);

  // Consultation
  const consultation = {
    id: uuid(), patientId: patient.id, doctorId: doctor.id, doctorName: doctor.name,
    date: iso(consultDate),
    vitalSigns: {
      temperature: (36 + rnd() * 3).toFixed(1),
      bloodPressureSystolic: String(int(100, 165)), bloodPressureDiastolic: String(int(60, 100)),
      heartRate: String(int(58, 115)), oxygenSaturation: String(int(92, 99)),
      weight: String(int(15, 95)), height: String(int(110, 190)), tdr: '',
    },
    visitReason: pick(MOTIFS), diagnosis: pick(DIAGS), notes: '',
    prescriptions, labRequests: consultLabRequests, echoRequests: consultEchoRequests,
    createdAt: iso(createdAt),
  };
  consultations.push(consultation);
  journey.push({
    id: uuid(), patientId: patient.id, timestamp: iso(consultDate),
    department: 'consultation', action: `Consultation — ${doctor.name}`, status: 'in_consultation',
    actorId: doctor.id, actorName: doctor.name,
  });

  // Facture Caisse
  const cashier = pick(cashiers);
  const invoiceId = uuid();
  const numFac = numeroFacture(consultDate);
  const invoice = {
    id: invoiceId, numeroFacture: numFac, patientId: patient.id, consultationId: consultation.id,
    clientName, clientType, items, totalAmount,
    patientCharge: clientType === 'societe' ? 0 : totalAmount,
    status: 'pending', createdAt: iso(consultDate), isExternal: false,
  };

  // Statut de paiement
  let paidAtDate = null;
  if (clientType === 'societe') {
    if (chance(0.38)) {
      invoice.status = 'paid';
      invoice.paidBy = U_BIL.id;
      paidAtDate = addMin(consultDate, int(30, 240));
      invoice.paidAt = iso(paidAtDate);
    } else {
      invoice.creditSociete = true; // tiers payant : règlement société en fin de mois
    }
  } else {
    invoice.status = 'paid';
    invoice.paidBy = cashier.id;
    paidAtDate = addMin(consultDate, int(15, 90));
    invoice.paidAt = iso(paidAtDate);
  }
  invoices.push(invoice);

  // Vente
  const typeVente = items.some(i => i.category === 'echo') ? 'echo'
    : items.some(i => i.category === 'lab') ? 'labo'
    : items.some(i => i.category === 'pharmacy') ? 'pharmacie'
    : 'consultation';
  const paidNow = invoice.status === 'paid' && clientType !== 'societe';
  const vente = {
    id: uuid(), patientId: patient.id, consultationId: consultation.id,
    numeroFacture: numFac, type: typeVente, clientType, clientName,
    // Toute vente est rattachée à une famille (celle de ses lignes).
    family: familleVente(items),
    subtotal: totalAmount, remisePct: 0, remiseMontant: 0,
    montantFacture: totalAmount,
    montantPaye: paidNow ? totalAmount : 0,
    status: paidNow ? 'paid' : 'pending',
    isExterne: false, source: 'caisse',
    dateVente: iso(consultDate),
    createdBy: cashier.id, createdByName: cashier.name,
    createdAt: iso(consultDate), legacyInvoiceId: invoiceId,
  };
  if (paidNow) {
    vente.datePaiement = invoice.paidAt; vente.paidAt = invoice.paidAt;
    vente.paidBy = cashier.id; vente.paidByName = cashier.name;
  }
  ventes.push(vente);

  for (const it of items) {
    venteLines.push({
      id: uuid(), venteId: vente.id, dateSort: ymd(consultDate),
      articleName: it.description, quantity: it.quantity, unitPrice: it.unitPrice,
      discount: 0, category: it.category,
      family: familleLigne(it.description, it.category),
    });
  }
  if (paidNow) {
    ventePayments.push({
      id: uuid(), venteId: vente.id, amount: totalAmount,
      method: pick(['Espèces', 'Espèces', 'Mobile Money', 'Mobile Money', 'Carte bancaire']),
      date: invoice.paidAt, paidBy: cashier.name, paidByUserId: cashier.id,
    });
    audit(paidAtDate, cashier, 'PAIEMENT_FACTURE', `${vente.numeroFacture} — ${clientName} : ${totalAmount.toLocaleString('fr-FR')} Ar (${typeVente})`);
  }

  // Analyses : demandes labo
  for (const it of items.filter(i => i.category === 'lab')) {
    const ex = labCatalog.find(e => e.code === it.code);
    if (!ex) continue;
    const results = ex.parameters.map(par => {
      const min = int(2, 20), max = min + int(4, 30);
      const val = Math.round((min + rnd() * (max - min)) * 100) / 100;
      return { parameter: par, value: val, unit: pick(['mg/L', 'g/L', 'UI/L', 'mmol/L']), normalMin: min, normalMax: max, normalRangeText: `${min} - ${max}`, isAbnormal: chance(0.06) };
    });
    const lr = {
      id: uuid(), patientId: patient.id, consultationId: consultation.id,
      examType: ex.name, code: ex.code, category: ex.category, parameters: [...ex.parameters],
      urgent: chance(0.08), status: 'completed', sampleType: ex.sampleType,
      sampleReceived: true, sampleReceivedAt: iso(addMin(consultDate, int(20, 60))),
      requestedBy: doctor.id, requestedAt: iso(consultDate), price: it.unitPrice,
      results, completedAt: iso(addMin(consultDate, int(120, 300))), completedBy: U_LAB.id,
      validatedBy: U_LAB.id, biologicalAlert: false, labConclusion: pick(CONCLUSIONS_LAB),
    };
    labRequests.push(lr);
    consultLabRequests.push({ ...lr });
  }
  for (const it of items.filter(i => i.category === 'echo')) {
    consultEchoRequests.push({
      id: uuid(), patientId: patient.id, consultationId: consultation.id,
      examType: it.description, urgent: false, status: 'completed',
      requestedBy: doctor.id, requestedAt: iso(consultDate),
    });
  }

  // Pharmacie : délivrance (~70 %)
  let deliveredAny = false;
  for (const pr of prescriptions) {
    if (!chance(0.7)) continue;
    pr.delivered = true;
    deliveredAny = true;
    pharmaDeliveryItems.push({
      id: uuid(), consultationId: consultation.id, patientId: patient.id,
      patientName: clientName, doctorName: doctor.name,
      articleId: pr.articleId, articleName: pr.articleName, quantity: pr.quantity,
      unitPrice: pr.unitPrice, posology: pr.posology,
      deliveredAt: iso(addMin(consultDate, int(45, 180))),
      deliveredByUserId: pick(pharmas).id, deliveredByName: pick(pharmas).name,
      isExternal: false, closingId: undefined,
    });
    stockMovements.push({
      id: uuid(), type: 'exit', articleId: pr.articleId, articleName: pr.articleName,
      quantity: pr.quantity, fromLocation: 'pharmacie', toLocation: 'patient',
      reason: `Délivrance ordonnance ${clientName}`, ref: short(consultation.id),
      date: iso(addMin(consultDate, int(45, 180))), userId: pick(pharmas).id, userName: pick(pharmas).name,
    });
  }
  if (items.some(i => i.category === 'lab')) {
    journey.push({ id: uuid(), patientId: patient.id, timestamp: iso(addMin(consultDate, int(120, 300))), department: 'laboratoire', action: 'Analyses effectuées', status: 'analyses_complete', actorId: U_LAB.id, actorName: U_LAB.name });
  }
  if (deliveredAny) {
    journey.push({ id: uuid(), patientId: patient.id, timestamp: iso(addMin(consultDate, int(45, 180))), department: 'pharmacie', action: 'Médicaments délivrés', status: 'medications_delivered', actorId: pick(pharmas).id, actorName: pick(pharmas).name });
  }
  if (paidNow) {
    journey.push({ id: uuid(), patientId: patient.id, timestamp: invoice.paidAt, department: 'caisse', action: `Facture ${vente.numeroFacture} encaissée`, status: 'invoice_paid', actorId: cashier.id, actorName: cashier.name });
  }

  // Suivi mensuel tiers payant
  if (clientType === 'societe') {
    const mk = monthKey(consultDate);
    parMoisSociete[mk] = parMoisSociete[mk] || {};
    (parMoisSociete[mk][patient.company] = parMoisSociete[mk][patient.company] || []).push(invoiceId);
  }
  pushBucket(bucketFactures, ymd(consultDate), cashier.id, { invoiceId, isExternal: false, amount: totalAmount });
  return { invoice, consultation, paidNow };
}

// ------------------------------------------------- ventes externes directes
function genererVenteExterne(day) {
  const extName = `${pick(PRENOMS)} ${pick(NOMS)}`;
  const cashier = pick(cashiers);
  const createdAt = atHour(day, int(9, 16), int(0, 59));
  const nb = int(1, 4);
  const items = [];
  for (let i = 0; i < nb; i++) {
    const art = pick(medicArticles);
    if (items.some(x => x.code === art.id)) continue;
    const qty = int(1, 6);
    items.push({ code: art.id, description: art.name, quantity: qty, unitPrice: art.priceExterne, amount: art.priceExterne * qty, category: 'pharmacy' });
  }
  const total = items.reduce((s, i) => s + i.amount, 0);
  const invoiceId = uuid();
  const numFac = numeroFacture(createdAt);
  invoices.push({
    id: invoiceId, numeroFacture: numFac, patientId: undefined, consultationId: undefined,
    clientName: extName, clientType: 'externe', items, totalAmount: total,
    patientCharge: total, status: 'paid', paidAt: iso(createdAt), paidBy: cashier.id,
    createdAt: iso(createdAt), isExternal: true,
  });
  const vente = {
    id: uuid(), patientId: undefined, consultationId: undefined,
    numeroFacture: numFac, type: 'externe', clientType: 'externe', clientName: extName,
    family: familleVente(items),
    subtotal: total, remisePct: 0, remiseMontant: 0, montantFacture: total,
    montantPaye: total, status: 'paid', isExterne: true, source: 'caisse',
    dateVente: iso(createdAt), datePaiement: iso(createdAt), paidAt: iso(createdAt),
    createdBy: cashier.id, createdByName: cashier.name, paidBy: cashier.id, paidByName: cashier.name,
    createdAt: iso(createdAt), legacyInvoiceId: invoiceId,
  };
  ventes.push(vente);
  for (const it of items) {
    venteLines.push({ id: uuid(), venteId: vente.id, dateSort: ymd(createdAt), articleName: it.description, quantity: it.quantity, unitPrice: it.unitPrice, discount: 0, category: it.category, family: familleLigne(it.description, it.category) });
    stockMovements.push({
      id: uuid(), type: 'exit', articleId: it.code, articleName: it.description,
      quantity: it.quantity, fromLocation: 'pharmacie', toLocation: 'client_externe',
      reason: `Vente externe — ${extName}`, ref: short(vente.id), date: iso(createdAt),
      userId: cashier.id, userName: cashier.name,
    });
  }
  ventePayments.push({ id: uuid(), venteId: vente.id, amount: total, method: chance(0.6) ? 'Espèces' : 'Mobile Money', date: iso(createdAt), paidBy: cashier.name, paidByUserId: cashier.id });
  audit(createdAt, cashier, 'PAIEMENT_FACTURE', `${vente.numeroFacture} — Client externe ${extName} : ${total.toLocaleString('fr-FR')} Ar`);
  pushBucket(bucketFactures, ymd(createdAt), cashier.id, { invoiceId, isExternal: true, amount: total });
  return { invoice: invoices[invoices.length - 1], consultation: null, paidNow: true };
}

// ------------------------------------------------- hospit / bloc ---------
function genererHb(day) {
  const estSociete = chance(0.75);
  const patient = estSociete
    ? pick(patients.filter(p => p.clientType === 'societe'))
    : pick(patients.filter(p => p.clientType === 'comptoir'));
  const clientType = patient.clientType;
  const type = chance(0.55) ? 'hospit' : 'bloc';
  const openedAt = atHour(day, 7, int(30, 59));
  const lines = [];
  if (type === 'hospit') {
    const jours = int(2, 6);
    for (const base of HB_HOSPIT) {
      lines.push({ id: uuid(), articleName: base.n, quantity: jours, unitPrice: base.p, discount: 0, dateSort: ymd(openedAt) });
    }
  } else {
    const base = pick(HB_BLOC);
    lines.push({ id: uuid(), articleName: base.n, quantity: 1, unitPrice: base.p, discount: 0, dateSort: ymd(openedAt) });
    if (base.n !== 'Petite chirurgie / suture') {
      lines.push({ id: uuid(), articleName: 'Anesthésie générale', quantity: 1, unitPrice: 120000, discount: 0, dateSort: ymd(openedAt) });
    }
    lines.push({ id: uuid(), articleName: 'Soins infirmiers quotidiens', quantity: int(1, 3), unitPrice: 18000, discount: 0, dateSort: ymd(openedAt) });
  }
  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const cashier = pick(cashiers);
  const paidAt = iso(addMin(openedAt, int(180, 420)));
  const numFac = numeroFacture(openedAt);
  const hb = {
    id: uuid(), patientId: patient.id, patientName: `${patient.lastName} ${patient.firstName}`,
    clientType, company: patient.company, type, lines,
    payments: [{ amount: total, paidBy: cashier.name, date: paidAt, paidByUserId: cashier.id, receivedBy: 'caisse' }],
    openedAt: iso(openedAt), openedBy: U_REC.name, openedByUserId: U_REC.id, numeroFacture: numFac,
  };
  hbRecords.push(hb);
  const vente = {
    id: uuid(), patientId: patient.id, consultationId: undefined,
    numeroFacture: numFac, type: type === 'hospit' ? 'hospitalisation' : 'bloc',
    clientType, clientName: hb.patientName, company: patient.company,
    family: 'HOSP', // hospitalisation et bloc opératoire : famille Hospitalisation
    subtotal: total, remisePct: 0, remiseMontant: 0, montantFacture: total,
    montantPaye: total, status: 'paid', isExterne: false, source: 'caisse',
    dateVente: iso(openedAt), datePaiement: paidAt, paidAt,
    createdBy: cashier.id, createdByName: cashier.name, paidBy: cashier.id, paidByName: cashier.name,
    createdAt: iso(openedAt), legacyHbRecordId: hb.id,
  };
  ventes.push(vente);
  for (const l of lines) {
    // Catégorie CANONIQUE de la ligne ('hospitalization', comme le type VenteLine) :
    // c'est elle qui résout la famille de facturation (HOSP / BLOC).
    const catLigne = type === 'hospit' ? 'hospitalization' : 'bloc';
    venteLines.push({ id: uuid(), venteId: vente.id, dateSort: l.dateSort, articleName: l.articleName, quantity: l.quantity, unitPrice: l.unitPrice, discount: 0, category: catLigne, family: familleLigne(l.articleName, catLigne) });
  }
  ventePayments.push({ id: uuid(), venteId: vente.id, amount: total, method: 'Virement', date: paidAt, paidBy: cashier.name, paidByUserId: cashier.id });
  journey.push({ id: uuid(), patientId: patient.id, timestamp: iso(openedAt), department: type === 'hospit' ? 'hospitalisation' : 'bloc', action: type === 'hospit' ? 'Admission hospitalisation' : 'Passage au bloc opératoire', status: 'in_consultation', actorId: U_REC.id, actorName: U_REC.name });
  journey.push({ id: uuid(), patientId: patient.id, timestamp: paidAt, department: 'caisse', action: `Facture ${vente.numeroFacture} encaissée (${type === 'hospit' ? 'hospitalisation' : 'bloc'})`, status: 'invoice_paid', actorId: cashier.id, actorName: cashier.name });
  audit(new Date(paidAt), cashier, 'PAIEMENT_FACTURE', `${vente.numeroFacture} — ${hb.patientName} : ${total.toLocaleString('fr-FR')} Ar (${type})`);
  if (clientType === 'societe') {
    const mk = monthKey(openedAt);
    parMoisSociete[mk] = parMoisSociete[mk] || {};
    (parMoisSociete[mk][patient.company] = parMoisSociete[mk][patient.company] || []).push(vente.id);
  }
  pushBucket(bucketHb, ymd(openedAt), cashier.id, { venteId: vente.id, amount: total });
  return vente;
}

// ------------------------------------------------------ boucle journalière
const visitesParJour = new Map(); // ymd -> [{invoice, paidNow, consultation}]
for (const day of days) {
  const liste = [];
  const n = day.getUTCDay() === 6 ? int(3, 6) : int(4, 8);
  for (let i = 0; i < n; i++) liste.push(genererVisite(day));
  if (chance(0.9)) liste.push(genererVenteExterne(day));
  visitesParJour.set(ymd(day), liste);
}
// Hospit / bloc : ~16 dossiers répartis
const hbDays = [...days].sort(() => rnd() - 0.5).slice(0, 16).sort((a, b) => a - b);
const hbParJour = new Map();
for (const day of hbDays) {
  const v = genererHb(day);
  if (!hbParJour.has(ymd(day))) hbParJour.set(ymd(day), []);
  hbParJour.get(ymd(day)).push(v);
}

// ------------------------------------------------------ clôtures de caisse
for (const day of days) {
  const parCaissier = bucketFactures.get(ymd(day));
  const hbCaissiers = bucketHb.get(ymd(day));
  if (!parCaissier && !hbCaissiers) continue;
  const caissiersJour = new Set([...(parCaissier ? parCaissier.keys() : []), ...(hbCaissiers ? hbCaissiers.keys() : [])]);
  for (const cashierId of caissiersJour) {
    const cashier = U(cashierId);
    const factures = (parCaissier?.get(cashierId)) || [];
    const hbListe = (hbCaissiers?.get(cashierId)) || [];
    if (!factures.length && !hbListe.length) continue;
    let consultationTotal = 0, externalTotal = 0, hospitalizationTotal = 0;
    const ids = [];
    const closingId = uuid();
    for (const f of factures) {
      ids.push(f.invoiceId);
      const inv = invoices.find(i => i.id === f.invoiceId);
      if (inv) inv.closingId = closingId;
      if (f.isExternal) externalTotal += f.amount; else consultationTotal += f.amount;
    }
    for (const h of hbListe) {
      hospitalizationTotal += h.amount;
      const v = ventes.find(x => x.id === h.venteId);
      if (v) v.closingId = closingId;
    }
    const closingTs = atHour(day, 18, 30);
    cashClosings.push({
      id: closingId, date: iso(closingTs), cashierId: cashier.id, cashierName: cashier.name,
      invoiceIds: ids, invoiceCount: ids.length,
      consultationTotal, externalTotal, hospitalizationTotal,
      grandTotal: consultationTotal + externalTotal + hospitalizationTotal,
      createdAt: iso(closingTs),
    });
    audit(closingTs, cashier, 'CLOTURE_CAISSE', `Clôture ${cashier.name} du ${ymd(day)} — ${(consultationTotal + externalTotal + hospitalizationTotal).toLocaleString('fr-FR')} Ar (${ids.length} facture(s))`);
  }
}

// ------------------------------------------------- comptes société (tiers)
for (const [mk, parCo] of Object.entries(parMoisSociete)) {
  for (const [co, invIds] of Object.entries(parCo)) {
    const montant = invIds.reduce((s, id) => {
      const inv = invoices.find(i => i.id === id) || ventes.find(v => v.id === id);
      return s + (inv ? (inv.totalAmount ?? inv.montantFacture) : 0);
    }, 0);
    const moisNum = mk.slice(5, 7);
    const creeLe = new Date(Date.UTC(2026, parseInt(moisNum, 10) - 1, 28, 17, int(0, 30), int(0, 59)));
    const cba = {
      id: uuid(), company: co, month: mk, invoiceIds: invIds,
      totalAmount: montant, paidAmount: 0, status: 'pending', createdAt: iso(creeLe), payments: [],
    };
    if (mk < '2026-09') {
      // Règlement intégral le mois suivant + éventuel acompte avant
      const paiementLe = new Date(Date.UTC(2026, parseInt(moisNum, 10), int(5, 12), 11, 0, 10));
      if (chance(0.35)) {
        const acompte = Math.round(montant * (0.2 + rnd() * 0.3));
        const acompteLe = new Date(Date.UTC(2026, parseInt(moisNum, 10) - 1, int(22, 28), 15, int(0, 40), 0));
        cba.payments.push({ id: uuid(), amount: acompte, date: iso(acompteLe), method: 'Virement', reference: `VIR-${co.slice(0, 3).toUpperCase()}-${mk.replace('-', '')}-AC`, invoiceIds: [...invIds] });
        cba.paidAmount += acompte;
        audit(acompteLe, U_BIL, 'REGLEMENT_SOCIETE_PARTIEL', `${co} — ${MOIS_FR[moisNum]} 2026 : acompte ${acompte.toLocaleString('fr-FR')} Ar / ${montant.toLocaleString('fr-FR')} Ar`);
      }
      const solde = montant - cba.paidAmount;
      cba.payments.push({ id: uuid(), amount: solde, date: iso(paiementLe), method: 'Virement', reference: `VIR-${co.slice(0, 3).toUpperCase()}-${mk.replace('-', '')}`, invoiceIds: [...invIds] });
      cba.paidAmount = montant;
      cba.status = 'paid';
      // Factures société marquées payées au règlement
      for (const id of invIds) {
        const inv = invoices.find(i => i.id === id);
        if (inv && inv.status !== 'paid') { inv.status = 'paid'; inv.paidAt = iso(paiementLe); inv.paidBy = U_BIL.id; }
        const v = ventes.find(x => x.id === id || x.legacyInvoiceId === id);
        if (v && v.status !== 'paid') { v.status = 'paid'; v.montantPaye = v.montantFacture; v.datePaiement = iso(paiementLe); v.paidAt = iso(paiementLe); v.paidBy = U_BIL.id; v.paidByName = U_BIL.name; }
      }
      audit(paiementLe, U_BIL, 'REGLEMENT_SOCIETE', `${co} — ${MOIS_FR[moisNum]} 2026 : règlement ${solde.toLocaleString('fr-FR')} Ar (${invIds.length} facture(s))`);
    }
    companyBillingAccounts.push(cba);
  }
}

// ------------------------------------------------------------- stock -------
let blSeq = 0;
const moisListe = ['2026-06', '2026-07', '2026-08', '2026-09'];
for (const mk of moisListe) {
  const moisNum = parseInt(mk.slice(5, 7), 10) - 1;
  // 2 achats par mois et par fournisseur (1 en septembre : mois en cours)
  const nbAchats = mk === '2026-09' ? 1 : 2;
  for (const fournisseur of fournisseurs) {
    for (let k = 0; k < nbAchats; k++) {
      const ref = `BL-2026-${String(++blSeq).padStart(4, '0')}`;
      const jourMin = mk === '2026-06' ? 17 : 3; // fenêtre commence le 17/06
      const date = new Date(Date.UTC(2026, moisNum, int(jourMin, mk === '2026-09' ? 16 : 26), int(8, 10), int(0, 59), int(0, 59)));
      if (date > END) continue;
      const headerId = uuid();
      // Seuls les médicaments sont gérés en stock : les achats ne portent que sur eux.
      const pool = medicArticles;
      const nbLignes = int(2, 5);
      let totalQty = 0;
      for (let i = 0; i < nbLignes; i++) {
        const art = pick(pool);
        const qty = int(30, 300);
        totalQty += qty;
        movementLines.push({ id: uuid(), movementId: headerId, articleId: art.id, articleName: art.name, quantity: qty, purchasePrice: art.purchasePrice, reason: `Achat ${fournisseur}` });
        stockEntries.push({
          id: uuid(), articleId: art.id, articleName: art.name, quantity: qty,
          purchasePrice: art.purchasePrice, supplier: fournisseur, invoiceRef: ref,
          expiryDate: `202${int(7, 9)}-${String(int(1, 12)).padStart(2, '0')}-${String(int(1, 28)).padStart(2, '0')}`,
          date: iso(date), enteredBy: U_MAG.id, category: 'central', destination: 'central',
        });
        stockMovements.push({
          id: uuid(), type: 'entry', articleId: art.id, articleName: art.name, quantity: qty,
          fromLocation: 'external', toLocation: 'central', reason: `Achat fournisseur ${fournisseur}`,
          ref, date: iso(date), userId: U_MAG.id, userName: U_MAG.name,
        });
      }
      movementHeaders.push({
        id: headerId, type: 'achat', ref, date: iso(date), userId: U_MAG.id, userName: U_MAG.name,
        fromLocation: 'external', toLocation: 'central', totalQuantity: totalQty,
        notes: `Achat fournisseur ${fournisseur}`, status: 'completed',
      });
      audit(date, U_MAG, 'ACHAT_DEPOT_CENTRAL', `${ref} — ${fournisseur} : ${nbLignes} article(s), ${totalQty} unités au dépôt central`);
    }
  }
  // Transfert central → pharmacie (hebdomadaire)
  for (const day of days.filter((d, i) => i % 7 === 3 && monthKey(d) === mk)) {
    const date = atHour(day, 9, int(0, 40));
    const headerId = uuid();
    const nbLignes = int(2, 4);
    let totalQty = 0;
    for (let i = 0; i < nbLignes; i++) {
      const art = pick(medicArticles);
      const qty = int(20, 120);
      totalQty += qty;
      movementLines.push({ id: uuid(), movementId: headerId, articleId: art.id, articleName: art.name, quantity: qty, purchasePrice: art.purchasePrice, reason: 'Réapprovisionnement pharmacie' });
      stockMovements.push({
        id: uuid(), type: 'transfer', articleId: art.id, articleName: art.name, quantity: qty,
        fromLocation: 'central', toLocation: 'pharmacie', reason: 'Transfert vers Pharmacie',
        ref: short(headerId), date: iso(date), userId: U_MAG.id, userName: U_MAG.name,
      });
    }
    movementHeaders.push({
      id: headerId, type: 'transfert', ref: `TRF-${mk.replace('-', '')}-${short(headerId)}`, date: iso(date),
      userId: U_MAG.id, userName: U_MAG.name, fromLocation: 'central', toLocation: 'pharmacie',
      totalQuantity: totalQty, notes: 'Réapprovisionnement pharmacie', status: 'completed',
    });
  }
  // Dispersion vers services (laboratoire / soins / urgences / bloc)
  const svcPool = services.filter(s => !['svc-pharmacie'].includes(s.id));
  const nbDisp = mk === '2026-09' ? 6 : 12;
  for (let i = 0; i < nbDisp; i++) {
    const day = pick(days.filter(d => monthKey(d) === mk));
    const date = atHour(day, int(10, 15), int(0, 59));
    const svc = pick(svcPool);
    const art = pick(medicArticles); // dispersion : familles gérées en stock uniquement
    const qty = int(10, 60);
    const trId = uuid();
    const demandeLe = iso(addMin(date, -int(240, 2880)));
    const transfere = chance(0.75);
    stockTransfers.push({
      id: trId, articleId: art.id, articleName: art.name, quantity: qty,
      category: 'hospitalisation', purchasePrice: art.purchasePrice, supplier: art.supplier || pick(fournisseurs),
      requestedBy: U_MAG.id, requestedAt: demandeLe, status: transfere ? 'transferred' : 'requested',
      notes: `Réapprovisionnement ${svc.name}`, targetServiceId: svc.id, targetServiceName: svc.name,
      requestSource: 'hospitalisation',
      ...(transfere ? { transferredBy: U_MAG.id, transferredAt: iso(date) } : {}),
    });
    if (transfere) {
      stockMovements.push({
        id: uuid(), type: 'transfer', articleId: art.id, articleName: art.name, quantity: qty,
        fromLocation: 'central', toLocation: svc.id, reason: `Transfert vers ${svc.name}`,
        ref: short(trId), date: iso(date), userId: U_MAG.id, userName: U_MAG.name,
        serviceId: svc.id, serviceName: svc.name,
      });
      audit(date, U_MAG, 'DISPERSION_SERVICE', `${art.name} x${qty} → ${svc.name}`);
    }
  }
}

// Inventaires de fin de mois (juin, juillet, août)
for (const [idx, mk] of ['2026-06', '2026-07', '2026-08'].entries()) {
  const moisNum = parseInt(mk.slice(5, 7), 10) - 1;
  const startedAt = new Date(Date.UTC(2026, moisNum, idx === 1 ? 31 : 30, 16, 0, int(0, 59)));
  const articlesInventories = articles.filter(a => gereStock(a.family));
  const linesInv = articlesInventories.map(art => {
    const theoreticalQty = int(50, 1500);
    const difference = chance(0.12) ? -int(1, 4) : 0;
    if (difference !== 0) {
      stockMovements.push({
        id: uuid(), type: 'inventory_adjust', articleId: art.id, articleName: art.name,
        quantity: Math.abs(difference), fromLocation: 'central', toLocation: 'ajustement',
        reason: `Écart inventaire ${MOIS_FR[mk.slice(5, 7)]} 2026`, ref: `INV-${mk.replace('-', '')}`,
        date: iso(addMin(startedAt, 120)), userId: U_MAG.id, userName: U_MAG.name,
      });
    }
    return { articleId: art.id, articleName: art.name, theoreticalQty, countedQty: theoreticalQty + difference, difference };
  });
  inventorySessions.push({
    id: uuid(), location: 'central', locationLabel: 'Dépôt central', status: 'completed',
    startedAt: iso(startedAt), completedAt: iso(addMin(startedAt, 120)),
    startedBy: U_MAG.id, startedByName: U_MAG.name, lines: linesInv,
  });
  audit(addMin(startedAt, 120), U_MAG, 'INVENTAIRE', `Inventaire dépôt central ${MOIS_FR[mk.slice(5, 7)]} 2026 — ${articlesInventories.length} article(s) géré(s) en stock comptés`);
}

// ------------------------------------------------ clôtures livraisons pharma
let livSeq = 0;
for (const [mk, respIdx] of [['2026-06', 0], ['2026-07', 1], ['2026-08', 0]]) {
  const moisNum = parseInt(mk.slice(5, 7), 10) - 1;
  const resp = pharmas[respIdx % pharmas.length];
  const dateCloture = new Date(Date.UTC(2026, moisNum, moisNum === 5 ? 30 : 31, 19, 0, int(20, 30)));
  const closingId = uuid();
  const ids = pharmaDeliveryItems
    .filter(d => d.deliveredAt.slice(0, 7) === mk && d.closingId === undefined)
    .map(d => { d.closingId = closingId; return d.id; });
  pharmaDeliveryClosings.push({
    id: closingId, closingNumber: `LIV-2026-${String(++livSeq).padStart(4, '0')}`,
    date: iso(dateCloture), responsibleId: resp.id, responsibleName: resp.name, deliveryIds: ids,
  });
  audit(dateCloture, resp, 'CLOTURE_LIVRAISONS_PHARMA', `Clôture des délivrances ${MOIS_FR[mk.slice(5, 7)]} 2026 — ${ids.length} délivrance(s)`);
}

// ----------------------------------------------------- notifications -------
const notifTs = (mk, h) => { const moisNum = parseInt(mk.slice(5, 7), 10) - 1; return iso(new Date(Date.UTC(2026, moisNum, int(8, 25), h, int(0, 59), int(0, 59)))); };
for (const mk of moisListe) {
  for (let i = 0; i < 5; i++) {
    const art = pick(medicArticles);
    notifications.push({ id: uuid(), targetRole: 'pharmacy', message: `⚠️ Stock bas en pharmacie : ${art.name} (${int(0, 8)} restant)`, type: chance(0.25) ? 'critical' : 'warning', timestamp: notifTs(mk, 8), read: false });
  }
  for (let i = 0; i < 3; i++) {
    const art = pick(medicArticles);
    notifications.push({ id: uuid(), targetRole: 'magasinier', message: `Stock central faible : ${art.name} — réapprovisionnement conseillé`, type: 'warning', timestamp: notifTs(mk, 9), read: chance(0.5) });
  }
}
notifications.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

// ------------------------------------------------------------ messages -----
messages.push(
  { id: uuid(), from: 'USR-MAG', fromName: U_MAG.name, to: 'pharmacy', subject: 'Réapprovisionnement', content: 'Les demandes en attente seront livrées cette semaine au dépôt pharmacie.', timestamp: iso(addDays(END, -3)), read: false },
  { id: uuid(), from: 'USR-ADMIN', fromName: U('USR-ADMIN').name, to: 'billing', subject: 'Facturation société', content: 'Merci de relancer les règlements société du mois en cours avant la fin de semaine.', timestamp: iso(addDays(END, -1)), read: false },
);

// ------------------------------------- établissement / réglages d'impression -
// Les documents imprimés (factures A5 / A4) portent l'identité SALFA définie par
// `ETABLISSEMENT_SALFA` dans src/utils/printSalfaInvoice.ts. L'établissement
// principal et les réglages d'impression des données par défaut sont alignés sur
// ces MÊMES mentions (NIF, téléphone, e-mail) : une installation neuve — build
// statique déployé ou base WAMP — affiche et imprime la même identité que la base
// locale, sans réglage manuel.
const IDENTITE_SALFA = {
  nif: '5000767080',
  stat: '851 125 120 120 001 36',
  telephone: '038 34 092 61',
  telephone2: '034 50 670 90',
  email: 'salfa.tulear@gmail.com',
};
const etablissements = Array.isArray(data.etablissements) ? data.etablissements : [];
const principal = etablissements.find(e => e && e.isPrincipal) || etablissements[0];
if (principal) {
  principal.nif = principal.nif || IDENTITE_SALFA.nif;
  principal.stat = principal.stat || IDENTITE_SALFA.stat;
  principal.phone = principal.phone || IDENTITE_SALFA.telephone;
  principal.phone2 = principal.phone2 || IDENTITE_SALFA.telephone2;
  principal.email = principal.email || IDENTITE_SALFA.email;
}
const ts = data.ticketSettings || (data.ticketSettings = {});
ts.facilityName = ts.facilityName || (principal ? (principal.tradeName || principal.name) : '');
ts.address = ts.address || (principal ? principal.address : '');
ts.nif = ts.nif || (principal && principal.nif) || IDENTITE_SALFA.nif;
ts.phone = ts.phone || (principal && principal.phone) || IDENTITE_SALFA.telephone;
ts.email = ts.email || (principal && principal.email) || IDENTITE_SALFA.email;

// ------------------------------------------------------------ stock final -
// SEULS LES MÉDICAMENTS sont gérés en stock : leur état final est recalculé à
// partir des mouvements de la fenêtre (achats, transferts, sorties, écarts
// d'inventaire) et d'un stock d'ouverture suffisant pour rester plausible.
// Les actes / services (consultation, laboratoire, échographie, hospitalisation,
// dentaire, autres) ne portent aucun stock.
const fluxParArticle = new Map();
for (const m of stockMovements) {
  const f = fluxParArticle.get(m.articleId) || { central: 0, pharmacie: 0 };
  const q = Number(m.quantity) || 0;
  if (m.type === 'entry' && m.toLocation === 'central') f.central += q;
  else if (m.type === 'transfer') {
    if (m.fromLocation === 'central') f.central -= q;
    if (m.toLocation === 'pharmacie') f.pharmacie += q;
  } else if (m.type === 'exit' && m.fromLocation === 'pharmacie') f.pharmacie -= q;
  else if (m.type === 'inventory_adjust') f.central -= q;
  fluxParArticle.set(m.articleId, f);
}
for (const a of articles) {
  if (!gereStock(a.family)) { a.stockCentral = 0; a.stockPharmacie = 0; continue; }
  const flux = fluxParArticle.get(a.id) || { central: 0, pharmacie: 0 };
  const minC = Number(a.minStockCentral) || 0;
  const minP = Number(a.minStockPharmacie) || 0;
  const tendu = chance(0.18); // quelques références en stock bas, pour les alertes
  const ouvC = tendu ? Math.max(0, minC + int(0, 20) - flux.central) : Math.max(int(150, 700), minC + int(60, 250) - flux.central);
  const ouvP = tendu ? Math.max(0, minP + int(0, 10) - flux.pharmacie) : Math.max(int(120, 450), minP + int(40, 150) - flux.pharmacie);
  a.stockCentral = Math.max(0, Math.round(ouvC + flux.central));
  a.stockPharmacie = Math.max(0, Math.round(ouvP + flux.pharmacie));
}

// ------------------------------------------------------- assemblage final -
ventes.sort((a, b) => a.dateVente.localeCompare(b.dateVente));
invoices.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
journey.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
stockMovements.sort((a, b) => a.date.localeCompare(b.date));
auditLogs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

Object.assign(data, {
  familles: FAMILLES,
  patients, consultations, invoices, ventes, venteLines, ventePayments,
  cashClosings, stockTransfers, stockEntries, stockMovements, movementHeaders,
  movementLines, inventorySessions, pharmaDeliveryItems, pharmaDeliveryClosings,
  pharmaClosingCounter: pharmaDeliveryClosings.length,
  hbRecords, companyBillingAccounts, journey, labRequests, auditLogs,
  notifications, messages, factureCounter: Object.values(dailyCounts).reduce((a, b) => a + b, 0),
});

fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
console.log('✅ Données régénérées sur la fenêtre', ymd(START), '→', ymd(END));
console.log({
  familles: FAMILLES.length,
  famillesVentes: ventes.reduce((acc, v) => { acc[v.family] = (acc[v.family] || 0) + 1; return acc; }, {}),
  lignesSansFamille: venteLines.filter(l => !l.family).length,
  patients: patients.length, consultations: consultations.length, invoices: invoices.length,
  ventes: ventes.length, venteLines: venteLines.length, paiements: ventePayments.length,
  cloturesCaisse: cashClosings.length, labRequests: labRequests.length,
  delivrances: pharmaDeliveryItems.length, hb: hbRecords.length,
  mouvementsStock: stockMovements.length, entrees: stockEntries.length,
  comptesSociete: companyBillingAccounts.length, audit: auditLogs.length,
});
