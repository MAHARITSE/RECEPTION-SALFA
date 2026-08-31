const fs = require('fs');
const uuid = require('uuid').v4;
const file = './src/data/localData.json';
const data = JSON.parse(fs.readFileSync(file, 'utf-8'));

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString();
}

const endDate = new Date('2026-08-31T01:57:46-07:00');
const startDate = new Date();
startDate.setMonth(endDate.getMonth() - 3);

let dossierCounter = 500;

for (let i = 0; i < 50; i++) {
  const pId = uuid();
  const dDate = randomDate(startDate, endDate);
  data.patients.push({
    id: pId,
    dossier: 'PAT' + (dossierCounter++),
    firstName: 'Test' + i,
    lastName: 'Historique',
    dateOfBirth: '1980-01-01',
    age: '46 Ans',
    gender: i % 2 === 0 ? 'M' : 'F',
    address: 'Antananarivo',
    contact: '0340000000',
    ssn: '',
    clientType: 'comptoir',
    allergies: [],
    chronicTreatments: [],
    antecedents: [],
    registeredAt: dDate,
    registeredBy: 'RECEPTION',
    status: 'completed',
    lastVisitAt: dDate
  });

  const vId = uuid();
  if(!data.ventes) data.ventes = [];
  data.ventes.push({
    id: vId,
    patientId: pId,
    numeroFacture: 'FAC-2026-' + dossierCounter,
    type: 'consultation',
    clientType: 'comptoir',
    subtotal: 10000,
    remisePct: 0,
    remiseMontant: 0,
    montantFacture: 10000,
    montantPaye: 10000,
    status: 'paid',
    isExterne: false,
    source: 'caisse',
    dateVente: dDate,
    datePaiement: dDate,
    paidAt: dDate,
    paidBy: 'CAISSE',
    createdAt: dDate
  });
}

// Modify the 'caisse' user to have multiple roles
const caisseUser = data.users.find(u => u.role === 'cashier');
if (caisseUser) {
  caisseUser.roles = ['cashier', 'billing', 'receptionist'];
}
// Modify admin to have all roles
const adminUser = data.users.find(u => u.role === 'admin');
if (adminUser) {
  adminUser.roles = ['admin', 'doctor', 'cashier', 'pharmacy', 'magasinier', 'laboratory', 'billing'];
}

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log("Data generated successfully");
