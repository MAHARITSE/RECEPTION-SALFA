/**
 * generate_data_3mois.cjs
 * ------------------------------------------------------------------
 * Ajoute à src/data/localData.json un jeu de données de DÉMONSTRATION
 * cohérent sur 3 mois pleins révolus (Juin, Juillet, Août 2026),
 * adapté à l'analyse :
 *   - nouveaux patients comptoir + salariés conventionnés (liés à une société)
 *     + ventes externes ;
 *   - consultations, factures individuelles (comptoir / société / externe) ;
 *   - ventes (miroir unifié) pour les règlements « cash » et les sociétés soldées ;
 *   - demandes de laboratoire & parcours patient (journey) ;
 *   - comptes de facturation mensuels des sociétés (soldés + impayés)
 *     pour alimenter le module Facturation Société (regroupement mensuel).
 *
 * Usage :  node generate_data_3mois.cjs
 * Idempotent : il nettoie sa génération précédente (marquée _demo3m_ids)
 * puis régénère. Peut être relancé sans dupliquer.
 */
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const FILE = './src/data/localData.json';
const MARKER = 'H3M2026';

const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));

/* ---------- Nettoyage de la génération précédente ---------- */
function cleanupPrevious() {
  const prev = data._demo3m_ids;
  if (!prev) return;
  const setOf = (k) => new Set(prev[k] || []);
  data.patients = (data.patients || []).filter((x) => !setOf('patients').has(x.id));
  data.invoices = (data.invoices || []).filter((x) => !setOf('invoices').has(x.id));
  data.ventes = (data.ventes || []).filter((x) => !setOf('ventes').has(x.id));
  data.consultations = (data.consultations || []).filter((x) => !setOf('consultations').has(x.id));
  data.labRequests = (data.labRequests || []).filter((x) => !setOf('lab').has(x.id));
  data.journey = (data.journey || []).filter((x) => !setOf('journey').has(x.id));
  data.companyBillingAccounts = (data.companyBillingAccounts || []).filter((x) => !setOf('accounts').has(x.id));
  delete data._demo3m_ids;
}
cleanupPrevious();

// Enregistre les identifiants générés pour le nettoyage futur.
const gen = { patients: [], invoices: [], ventes: [], consultations: [], lab: [], journey: [], accounts: [] };
const GENKEY = { labRequests: 'lab', companyBillingAccounts: 'accounts' };
const gpush = (table, obj) => {
  (data[table] = data[table] || []).push(obj);
  gen[GENKEY[table] || table].push(obj.id);
};

/* ---------- Petits outils ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260902);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const MONTHS = [
  { m: '2026-06', label: 'Juin 2026', endDay: 30 },
  { m: '2026-07', label: 'Juillet 2026', endDay: 31 },
  { m: '2026-08', label: 'Août 2026', endDay: 31 },
];
const COMPANIES = data.companies || [];
const MONTH_IDX = { '2026-06': 0, '2026-07': 1, '2026-08': 2 };

const CATALOG = {
  consult_gen: { d: 'Consultation Générale', cat: 'consultation', p: 15000 },
  consult_spe: { d: 'Consultation Spécialiste', cat: 'consultation', p: 35000 },
  consult_urg: { d: 'Consultation Urgences', cat: 'consultation', p: 25000 },
  soin:        { d: 'Injection / Pansement / Soins', cat: 'consultation', p: 20000 },
  meds:        { d: 'Médicaments & Soins', cat: 'pharmacy', p: 15000 },
  nfs:         { d: 'NFS (Numération Formule Sanguine)', cat: 'lab', p: 15000 },
  glycemie:    { d: 'Glycémie à jeun', cat: 'lab', p: 8000 },
  crp:         { d: 'CRP', cat: 'lab', p: 7000 },
  creatinine:  { d: 'Créatinine', cat: 'lab', p: 10000 },
  bilanLip:    { d: 'Bilan lipidique', cat: 'lab', p: 20000 },
  tdr:         { d: 'TDR Paludisme', cat: 'lab', p: 5000 },
  echoAbd:     { d: 'Échographie abdominale', cat: 'echo', p: 30000 },
  echoPel:     { d: 'Échographie pelvienne', cat: 'echo', p: 25000 },
  hospJour:    { d: "Journée d'hospitalisation", cat: 'hospitalization', p: 50000 },
  matForfait:  { d: "Forfait maternité (accouchement)", cat: 'hospitalization', p: 250000 },
};
const EPISODES = [
  ['consult_gen'], ['consult_gen', 'meds'], ['consult_spe'], ['consult_spe', 'meds'],
  ['consult_urg', 'meds'], ['consult_gen', 'glycemie'], ['consult_gen', 'nfs'],
  ['consult_gen', 'tdr'], ['consult_gen', 'crp'], ['consult_gen', 'bilanLip'],
  ['consult_gen', 'creatinine'], ['consult_urg', 'nfs', 'tdr'], ['soin'],
  ['consult_spe', 'echoAbd'], ['consult_spe', 'echoPel'], ['consult_gen', 'meds', 'nfs'],
  ['soin', 'meds'],
];
const EXTERNE_EPISODES = [
  ['glycemie'], ['nfs'], ['tdr'], ['meds'], ['crp'], ['bilanLip'], ['echoAbd'], ['echoPel'], ['nfs', 'glycemie'],
];
const HOSP_EPISODES = [['hospJour', 'consult_gen'], ['matForfait']];

const PRENOMS_M = ['Jean','Lala','Hery','Mamy','Tovo','Ny Aina','Andry','Mihaja','Toky','Dina','Rija','Zo','Solofo','Naina','Faniry','Hajanirina','Feno','Manda','Sarobidy','Domoina','Aina','Tahiry','Tojo','Hasina'];
const PRENOMS_F = ['Voahangy','Nirina','Mamy','Ravo','Fara','Lova','Miora','Tiana','Aina','Tendry','Vololona','Hanta','Soa','Vola','Harena','Noro','Fetra','Bako','Hanitra','Sarah','Claudine'];
const NOMS = ['Rakoto','Rabe','Razafy','Randria','Ramanantsoa','Rakotomalala','Andrianarisoa','Ravelo','Rasoamanana','Rakotondrabe','Razanadrakoto','Razafindrakoto','Andriamanana','Randrianasolo','Rakotonirina','Rajaofera'];
const DISTRICTS = ['Analakely','Isotry','Andravoahangy','Ambanidia','Ivato','Ampasamadinika','Antohomadinika','Behoririka','67 Ha','Tsaralalàna','Ampandrana','Andoharanofotsy'];
const DOCTORS = [{ id: 'USR-DOC', name: 'Dr. Feno Rasoana' }, { id: 'USR-DOC2', name: 'Dr. Mialy Andria' }];
const MOTIFS = ['Fièvre et céphalées','Douleur abdominale','Toux persistante','Contrôle médical','Fatigue générale','Maux de gorge','Douleur dorsale','Suivi tension artérielle','Diarrhée','Douleur articulaire','Suivi grossesse','Consultation pré-opératoire'];
const DIAGS = ['Paludisme simple, traitement prescrit.','Infection respiratoire aiguë, antibiothérapie.','Hypertension artérielle équilibrée.','Gastrite aiguë, traitement symptomatique.','Épisode fébrile, surveillance.','Lombalgie commune, AINS.','Anémie légère, supplémentation martiale.','Grossesse normale, suivi prénatal.','RAS — contrôle de routine.','Angine, traitement symptomatique.'];

function makeDOB() {
  const y = randInt(1962, 2008);
  return { dateOfBirth: `${y}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`, age: `${new Date().getFullYear() - y} Ans` };
}
const mkPhone = () => `034 ${String(randInt(10, 99))} ${String(randInt(10, 99))} ${String(randInt(10, 99))}`;
const monthOf = (iso) => iso.slice(0, 7);
function pickDateTime(mo) {
  const d = randInt(1, mo.endDay - 1);
  const [y, mth] = mo.m.split('-').map(Number);
  return new Date(y, mth - 1, d, randInt(7, 17), randInt(0, 59), randInt(0, 59)).toISOString();
}

/* ---------- Numérotation ---------- */
let dossierCounter = 1100;
let invoiceSeq = 9000;
const mkDossier = () => `${MARKER}-${dossierCounter++}`;
const mkFac = () => `FAC-2026-${invoiceSeq++}`;

/* ---------- Patients ---------- */
let socOrder = 0;
function addPatient(kind) {
  const isF = rnd() < 0.52;
  const dob = makeDOB();
  const p = {
    id: uuidv4(), dossier: mkDossier(),
    firstName: isF ? pick(PRENOMS_F) : pick(PRENOMS_M), lastName: pick(NOMS),
    dateOfBirth: dob.dateOfBirth, age: dob.age, gender: isF ? 'F' : 'M',
    address: `${pick(DISTRICTS)}, Antananarivo`, contact: mkPhone(), ssn: '',
    clientType: kind, allergies: [], chronicTreatments: [], antecedents: [],
    registeredAt: new Date(2026, 5, randInt(2, 20)).toISOString(),
    registeredBy: 'RECEPTION', status: 'completed',
  };
  if (kind === 'societe') {
    const comp = COMPANIES[socOrder++ % COMPANIES.length];
    p.company = comp.name; p.companyId = comp.id;
    p.matricule = `MAT-${comp.name.slice(0, 4).toUpperCase()}${randInt(1000, 9999)}`;
  }
  gen.patients.push(p.id); data.patients.push(p);
  return p;
}

// Roster : 6 salariés affectés à CHAQUE société + 10 patients comptoir réguliers
function addEmployee(company) {
  const isF = rnd() < 0.52;
  const dob = makeDOB();
  const p = {
    id: uuidv4(), dossier: mkDossier(),
    firstName: isF ? pick(PRENOMS_F) : pick(PRENOMS_M), lastName: pick(NOMS),
    dateOfBirth: dob.dateOfBirth, age: dob.age, gender: isF ? 'F' : 'M',
    address: `${pick(DISTRICTS)}, Antananarivo`, contact: mkPhone(), ssn: '',
    clientType: 'societe', allergies: [], chronicTreatments: [], antecedents: [],
    registeredAt: new Date(2026, 5, randInt(2, 20)).toISOString(),
    registeredBy: 'RECEPTION', status: 'completed',
    company: company.name, companyId: company.id,
    matricule: `MAT-${company.name.slice(0, 4).toUpperCase()}${randInt(1000, 9999)}`,
  };
  gen.patients.push(p.id); data.patients.push(p);
  return p;
}
const roster = {};
COMPANIES.forEach((c) => {
  roster[c.name] = [];
  for (let i = 0; i < 6; i++) roster[c.name].push(addEmployee(c));
});
const comptoirPool = [];
for (let i = 0; i < 10; i++) comptoirPool.push(addPatient('comptoir'));

/* ---------- Facture / vente / consultation ---------- */
function linesFor(keys, clientType) {
  const factor = clientType === 'societe' ? 0.9 : 1;
  return keys.map((k) => {
    const it = CATALOG[k];
    const q = it.cat === 'pharmacy' || it.cat === 'lab' ? randInt(1, 3) : 1;
    const amount = Math.max(3000, Math.round(it.p * q * (k === 'meds' ? randInt(8, 14) / 10 : 1) * factor));
    return { description: it.d, category: it.cat, quantity: q, amount };
  });
}

function venteFor(patient, date, items, total, clientType, clientName) {
  const cats = items.map((i) => i.category);
  let type = 'consultation';
  if (cats.some((c) => c === 'hospitalization')) type = 'hospitalisation';
  else if (cats.some((c) => c === 'echo')) type = 'echo';
  else if (cats.some((c) => c === 'lab')) type = 'labo';
  else if (cats.every((c) => c === 'pharmacy')) type = 'pharmacie';
  const isExt = clientType === 'externe';
  return {
    id: uuidv4(), patientId: patient?.id, numeroFacture: mkFac(), type, clientType,
    clientName: clientName || (patient ? `${patient.lastName} ${patient.firstName}` : undefined),
    company: patient?.company, subtotal: total, remisePct: 0, remiseMontant: 0,
    montantFacture: total, montantPaye: total, status: 'paid',
    isExterne: isExt, source: 'caisse', dateVente: date, datePaiement: date, paidAt: date,
    paidBy: 'CAISSE', createdAt: date,
  };
}

function addJourney(patient, date, invoice, consult) {
  const evts = [
    { id: uuidv4(), patientId: patient.id, timestamp: date, department: 'reception', action: 'Admission enregistrée', status: 'registered', actorName: 'Réception' },
    { id: uuidv4(), patientId: patient.id, timestamp: date, department: 'consultation', action: 'Consultation médicale', status: 'completed', actorName: 'Médecin', consultationId: consult?.id },
    { id: uuidv4(), patientId: patient.id, timestamp: date, department: 'caisse', action: invoice.creditSociete ? 'Validé en crédit société' : 'Paiement enregistré', status: 'invoice_paid', actorName: 'Caisse', invoiceId: invoice.id },
  ];
  evts.forEach((e) => { data.journey.push(e); gen.journey.push(e.id); });
}

function labCategory(name) {
  if (/NFS/.test(name)) return 'hematologie';
  if (/Glycémie|CRP|Créatinine|lipidique/.test(name)) return 'biochimie';
  if (/Paludisme/.test(name)) return 'parasitologie';
  return 'autre';
}

/* Paramètres biologiques réels par analyse (clé du catalogue) — sert à remplir
 * des résultats cohérents et exploitables dans le module Laboratoire (onglet
 * « Résultats ») et le dossier médical du médecin. */
const LAB_PARAMS = {
  nfs: ['Hémoglobine', 'Globules Blancs', 'Plaquettes'],
  glycemie: ['Glucose'],
  crp: ['CRP'],
  creatinine: ['Créatinine'],
  bilanLip: ['Cholestérol Total', 'Triglycérides'],
  tdr: ['Plasmodium'],
};
const QUALITATIFS = new Set(['Plasmodium', 'TDR Paludisme', 'VIH 1/2', 'TPHA/VDRL']);
const LAB_NORMS_DEMO = {
  'Hémoglobine': { min: 12, max: 17, unit: 'g/dL' },
  'Globules Blancs': { min: 4, max: 10, unit: 'G/L' },
  'Plaquettes': { min: 150, max: 400, unit: 'G/L' },
  'Glucose': { min: 0.7, max: 1.1, unit: 'g/L' },
  'CRP': { min: 0, max: 5, unit: 'mg/L' },
  'Créatinine': { min: 6, max: 12, unit: 'mg/L' },
  'Cholestérol Total': { min: 1.5, max: 2, unit: 'g/L' },
  'Triglycérides': { min: 0.5, max: 1.5, unit: 'g/L' },
};
/* Hachage déterministe (aucune consommation du PRNG global → la séquence des
 * autres données générées reste identique et les totaux ne changent pas). */
function hashCode(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967296;
}
function fmtVal(n) {
  return Math.round(n * 100) / 100;
}
/* Génère les résultats validés d'une analyse à partir de ses paramètres réels. */
function buildLabResults(id, paramNameList, abnormalRatio) {
  return paramNameList.map((param) => {
    const u = hashCode(id + '::' + param);
    const qualitatif = QUALITATIFS.has(param);
    if (qualitatif) {
      const positive = u > 0.93; // rares positifs pour l'analyse
      return { parameter: param, value: positive ? 'Positif' : 'Négatif', unit: '', normalMin: 0, normalMax: 0, normalRangeText: 'Négatif', isAbnormal: positive };
    }
    const norm = LAB_NORMS_DEMO[param];
    if (!norm) return { parameter: param, value: '—', unit: '', normalMin: 0, normalMax: 0, isAbnormal: false };
    const isAbn = u < abnormalRatio;
    let val;
    if (isAbn) {
      const below = Math.floor(u * 2) % 2 === 0;
      const lo = norm.min - (norm.max - norm.min) * (0.2 + 0.6 * ((u * 100) % 1));
      const hi = norm.max + (norm.max - norm.min) * (0.2 + 0.6 * ((u * 100) % 1));
      val = below ? Math.max(0, lo) : hi;
    } else {
      const f = (u - abnormalRatio) / (1 - abnormalRatio);
      val = norm.min + (norm.max - norm.min) * f;
    }
    return {
      parameter: param, value: fmtVal(val), unit: norm.unit,
      normalMin: norm.min, normalMax: norm.max,
      normalRangeText: `${norm.min} - ${norm.max} ${norm.unit}`,
      isAbnormal: isAbn,
    };
  });
}
const LAB_CONCLUSIONS = [
  'Résultat normal.',
  'Aucune anomalie biologique notable.',
  'Bilan dans les limites de la normale.',
  'Légère anomalie à surveiller, conduite à tenir habituelle.',
  'Anomalie significative — avis médical recommandé.',
];

function makeVisit(patient, date, keys, clientType, isExternal, clientName) {
  const items = linesFor(keys, clientType);
  const total = items.reduce((s, i) => s + i.amount, 0);
  const invoice = {
    id: uuidv4(), patientId: patient?.id, clientName: clientName || (patient ? `${patient.lastName} ${patient.firstName}` : 'Client externe'),
    clientType, items, totalAmount: total, patientCharge: total,
    status: 'paid', paidAt: date, paidBy: isExternal ? 'CAISSE' : (clientType === 'societe' ? 'FACTURATION' : 'CAISSE'),
    createdAt: date, isExternal,
  };
  if (clientType === 'societe') invoice.creditSociete = true;
  gpush('invoices', invoice);

  // Consultation + demande labo éventuelle (sauf externes)
  let consult;
  if (patient) {
    const doc = pick(DOCTORS);
    consult = {
      id: uuidv4(), patientId: patient.id, doctorId: doc.id, doctorName: doc.name,
      date, motif: pick(MOTIFS), diagnostic: pick(DIAGS), status: 'completed', createdAt: date,
      prescriptions: [], labRequests: [], echoRequests: [],
    };
    if (keys.includes('meds')) consult.prescriptions.push({ id: uuidv4(), articleName: 'Paracétamol 500mg', dosage: '1 comprimé 3x/jour', duration: '5 jours', quantity: randInt(10, 20) });
    const labKey = keys.find((k) => CATALOG[k].cat === 'lab');
    if (labKey) {
      const reqId = uuidv4();
      const examLabel = CATALOG[labKey].d;
      const params = (LAB_PARAMS[labKey] || []).length ? LAB_PARAMS[labKey] : [examLabel];
      const results = buildLabResults(reqId, params, 0.13);
      const hasAbn = results.some((r) => r.isAbnormal);
      const req = {
        id: reqId, patientId: patient.id, consultationId: consult.id, examType: examLabel,
        code: labKey.toUpperCase(),
        category: labCategory(examLabel), parameters: params, urgent: false,
        status: 'completed', sampleType: 'Sang veineux', requestedBy: 'USR-DOC', requestedAt: date,
        completedAt: new Date(new Date(date).getTime() + 1000 * 60 * 60 * (4 + Math.floor(hashCode(reqId) * 8))).toISOString(),
        completedBy: 'USR-LAB', validatedBy: 'USR-LAB',
        invoiceId: invoice.id,
        biologicalAlert: hasAbn,
        labConclusion: hasAbn
          ? 'Anomalie significative détectée — avis médical recommandé.'
          : LAB_CONCLUSIONS[Math.floor(hashCode(reqId + '::c') * 3)], // résultats normaux
        results,
      };
      gpush('labRequests', req);
      consult.labRequests.push(req);
    }
    gpush('consultations', consult);
    addJourney(patient, date, invoice, consult);
  }
  return { invoice, consult, items, total };
}

function addCashVisit(mo) {
  // 70% patient comptoir, 30% vente externe
  const isExternal = rnd() < 0.22;
  const date = pickDateTime(mo);
  let patient, clientName;
  if (isExternal) {
    const keys = pick(EXTERNE_EPISODES);
    const r = makeVisit(null, date, keys, 'externe', true, `${pick(PRENOMS_M)} ${pick(NOMS)}`);
    const v = venteFor(null, date, r.items, r.total, 'externe', r.invoice.clientName);
    gpush('ventes', v);
  } else {
    const pool = rnd() < 0.55 ? comptoirPool : [addPatient('comptoir')];
    patient = pool[0];
    const keys = rnd() < 0.07 ? pick(HOSP_EPISODES) : pick(EPISODES);
    const r = makeVisit(patient, date, keys, 'comptoir', false);
    const v = venteFor(patient, date, r.items, r.total, 'comptoir');
    gpush('ventes', v);
  }
}

function addSocieteVisit(mo) {
  const company = COMPANIES[socOrder++ % COMPANIES.length].name;
  const empRoster = roster[company];
  const employee = empRoster[socEmpOrder(company) % empRoster.length];
  const date = pickDateTime(mo);
  const keys = rnd() < 0.1 ? pick(HOSP_EPISODES) : pick(EPISODES);
  // Pas de vente « cash » ici : elle n'est créée qu'après règlement mensuel (voir plus bas).
  makeVisit(employee, date, keys, 'societe', false);
}
const socEmpCount = {};
function socEmpOrder(company) { return (socEmpCount[company] = (socEmpCount[company] || 0) + 1) - 1; }

/* ---------- Génération sur 3 mois ---------- */
for (const mo of MONTHS) {
  for (let i = 0; i < 12; i++) addSocieteVisit(mo); // 12 = 3/société
  for (let i = 0; i < 18; i++) addCashVisit(mo);     // comptoir + externes
}

// lastVisitAt des patients
const lastVisit = {};
data.patients.forEach((p) => { if (gen.patients.includes(p.id)) { const hits = data.invoices.filter((i) => i.patientId === p.id); hits.forEach((i) => { const t = i.paidAt || i.createdAt; if (!lastVisit[p.id] || t > lastVisit[p.id]) lastVisit[p.id] = t; }); if (lastVisit[p.id]) p.lastVisitAt = lastVisit[p.id]; } });

/* ---------- Comptes de facturation mensuels (sociétés) ---------- */
// mix soldé / impayé par société pour l'analyse
const settled = {
  JIRAMA: [true, false, true],
  TELMA: [false, true, false],
  'AIR MADAGASCAR': [true, true, false],
  'BNI MADAGASCAR': [false, false, true],
};

COMPANIES.forEach((company) => {
  MONTHS.forEach((mo) => {
    const monthInvs = (data.invoices || []).filter((i) =>
      i.clientType === 'societe' && i.creditSociete && monthOf(i.createdAt) === mo.m &&
      (() => { const p = data.patients.find((pp) => pp.id === i.patientId); return p && p.company === company.name; })()
    );
    if (monthInvs.length === 0) return;
    const isSettled = (settled[company.name] || [])[MONTH_IDX[mo.m]] === true;
    if (!isSettled) return; // mois impayé → visible en « Crédit Société » / à régler
    const totalAmount = monthInvs.reduce((s, i) => s + i.totalAmount, 0);
    const payDate = new Date(`${mo.m}-27T12:00:00`).toISOString();
    const ref = `VIR-${company.name.slice(0, 3).toUpperCase()}-${mo.m.replace('-', '')}`;
    const account = {
      id: uuidv4(), company: company.name, month: mo.m, invoiceIds: monthInvs.map((i) => i.id),
      totalAmount, paidAmount: totalAmount, status: 'paid', createdAt: payDate,
      finalSettlementAmount: totalAmount, finalSettlementDate: payDate, finalSettlementMethod: 'Virement',
      finalSettlementReference: ref, finalSettlementObservation: 'Règlement global mensuel (démo)',
      settledBy: 'USR-BIL', settledByName: 'Lova Sitraka',
      payments: [{ id: uuidv4(), amount: totalAmount, date: payDate, method: 'Virement', reference: ref, invoiceIds: monthInvs.map((i) => i.id), receivedBy: 'Lova Sitraka', receivedByUserId: 'USR-BIL' }],
    };
    gpush('companyBillingAccounts', account);
    // miroir vente « payée » pour la recette effective de la société
    monthInvs.forEach((inv) => {
      const pat = data.patients.find((pp) => pp.id === inv.patientId);
      const v = venteFor(pat, inv.paidAt || payDate, inv.items, inv.totalAmount, 'societe', inv.clientName);
      gpush('ventes', v);
    });
  });
});

// ---- Sauvegarde (avec marqueur de génération pour nettoyage futur) ----
data._demo3m_ids = gen;
fs.writeFileSync(FILE, JSON.stringify(data, null, 2), 'utf-8');

/* ---------- Résumé ---------- */
const fmt = (n) => n.toLocaleString('fr-FR');
const byMonth = {};
(data.invoices || []).forEach((i) => {
  if (gen.invoices.includes(i.id)) {
    const m = monthOf(i.createdAt);
    byMonth[m] = byMonth[m] || { n: 0, s: 0, comptoir: 0, societe: 0, externe: 0 };
    byMonth[m].n++; byMonth[m].s += i.totalAmount; byMonth[m][i.clientType] += i.totalAmount;
  }
});
console.log('\n===== SYNTHÈSE DONNÉES AJOUTÉES (3 mois) =====');
Object.keys(byMonth).sort().forEach((m) => {
  const b = byMonth[m];
  console.log(`${m}  → ${b.n} factures · ${fmt(b.s)} Ar  (comptoir ${fmt(b.comptoir)} · société ${fmt(b.societe)} · externe ${fmt(b.externe)})`);
});
console.log(`\nPatients ajoutés : ${gen.patients.length}`);
console.log(`Consultations ajoutées : ${gen.consultations.length}`);
console.log(`Demandes labo : ${gen.lab.length} · événements parcours : ${gen.journey.length}`);
console.log(`Ventes ajoutées : ${gen.ventes.length} · comptes sociétés créés : ${gen.accounts.length}`);
const byComp = {};
(data.invoices || []).forEach((i) => {
  if (!gen.invoices.includes(i.id) || i.clientType !== 'societe') return;
  const p = data.patients.find((pp) => pp.id === i.patientId);
  const k = `${p?.company || '?'}`;
  byComp[k] = byComp[k] || 0; byComp[k] += i.totalAmount;
});
console.log('\nFacturation société par entreprise (total 3 mois) :');
Object.entries(byComp).sort((a, b) => a[0].localeCompare(b[0])).forEach(([c, t]) => console.log(`   ${c.padEnd(15)} ${fmt(t)} Ar`));
console.log('\nTerminé. localData.json mis à jour.');
