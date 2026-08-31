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

let dossierCounter = data.patients.length + 500;
const roles = ['cashier', 'doctor', 'receptionist', 'billing'];

for (let i = 0; i < 300; i++) {
  const pId = uuid();
  const dDate = randomDate(startDate, endDate);
  data.patients.push({
    id: pId,
    dossier: 'PAT' + (dossierCounter++),
    firstName: 'Prenom' + i,
    lastName: 'Patient' + i,
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
    subtotal: 15000,
    remisePct: 0,
    remiseMontant: 0,
    montantFacture: 15000,
    montantPaye: 15000,
    status: 'paid',
    isExterne: false,
    source: 'caisse',
    dateVente: dDate,
    datePaiement: dDate,
    paidAt: dDate,
    paidBy: 'CAISSE',
    createdAt: dDate
  });
  
  if(!data.invoices) data.invoices = [];
  data.invoices.push({
    id: uuid(),
    patientId: pId,
    clientName: 'Patient' + i,
    clientType: 'comptoir',
    items: [
      { amount: 15000, description: 'Consultation' },
      { amount: 5000, description: 'Carnet' }
    ],
    totalAmount: 20000,
    patientCharge: 20000,
    status: 'paid',
    paidAt: dDate,
    paidBy: 'CAISSE',
    createdAt: dDate,
    isExternal: false
  });
}

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log("Data generated successfully");
