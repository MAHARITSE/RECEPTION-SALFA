const fs = require('fs');
const data = JSON.parse(fs.readFileSync('src/data/localData_fixed.json', 'utf-8'));
const requiredKeys = [
  'invoices', 'cashClosings', 'articles', 'stockTransfers', 'stockEntries',
  'auditLogs', 'notifications', 'messages', 'users', 'companies',
  'companyBillingAccounts', 'fournisseurs', 'familles', 'etablissements',
  'journey', 'labRequests', 'labCatalog', 'warehouseServices',
  'stockMovements', 'inventorySessions', 'movementHeaders', 'ventes', 'patients', 'consultations'
];
for (const k of requiredKeys) {
  if (!data[k]) data[k] = [];
}
fs.writeFileSync('src/data/localData.json', JSON.stringify(data, null, 2));
console.log('Fixed completely!');
