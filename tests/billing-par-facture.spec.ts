import { expect, test } from '@playwright/test';
import type { BillingDocument } from '../src/modules/assurance/monthlyBilling';
import { groupBillingDocumentsByFacture } from '../src/modules/assurance/monthlyBilling';
import { isOfficialFactureNumber } from '../src/utils/factureNumber';

const doc = (overrides: Partial<BillingDocument> = {}): BillingDocument => ({
  id: 'doc-1', sourceId: 'src-1', category: 'societe', companyId: 'soc-1', companyName: 'JIRAMA',
  number: 'FA-07/JIR/26-014', date: '2026-09-10', client: 'RAKOTO Jean', dossier: 'DOS-1', matricule: 'MAT-1',
  total: 40000, copay: 8000, payable: 32000, paid: 32000, rejected: 0,
  items: [{ description: 'Consultation', amount: 40000 }],
  ...overrides,
});

test('numérotation officielle : formats reconnus et anciens formats', () => {
  expect(isOfficialFactureNumber('26FA0427102')).toBe(true);   // comptoir / externes
  expect(isOfficialFactureNumber('FA-07/BSA/26-014')).toBe(true); // sociétés
  expect(isOfficialFactureNumber('fa-07/bsa/26-014')).toBe(true);
  expect(isOfficialFactureNumber('FACT-2026-014')).toBe(false);  // ancien format
  expect(isOfficialFactureNumber('')).toBe(false);
  expect(isOfficialFactureNumber(undefined)).toBe(false);
});

test('vue par facture : une ligne par numéro, totaux et statut consolidés', () => {
  const groupes = groupBillingDocumentsByFacture([
    doc({ id: 'a', sourceId: 'a', number: 'FA-09/JIR/26-001', date: '2026-09-03', total: 20000, copay: 4000, payable: 16000, paid: 8000 }),
    doc({ id: 'b', sourceId: 'b', number: 'fa-09/jir/26-001', date: '2026-09-08', total: 10000, copay: 2000, payable: 8000, paid: 0 }),
    doc({ id: 'c', sourceId: 'c', number: '26FA0909001', category: 'comptoir', companyName: undefined, date: '2026-09-09', total: 5000, copay: 0, payable: 5000, paid: 5000 }),
  ]);

  expect(groupes).toHaveLength(2);
  const [societe] = groupes.filter(g => g.number === 'FA-09/JIR/26-001');
  expect(societe.documents).toHaveLength(2);
  expect(societe.dateMin).toBe('2026-09-03');
  expect(societe.dateMax).toBe('2026-09-08');
  expect(societe.total).toBe(30000);
  expect(societe.copay).toBe(6000);
  expect(societe.payable).toBe(24000);
  expect(societe.paid).toBe(8000);
  expect(societe.remaining).toBe(16000);
  expect(societe.tauxRecouvrement).toBe(33);
  expect(societe.statut).toBe('Partiellement payé');
  expect(societe.actes).toBe(2);

  const comptoir = groupes.find(g => g.number === '26FA0909001')!;
  expect(comptoir.statut).toBe('Payé');
  expect(comptoir.tauxRecouvrement).toBe(100);
});

test('vue par facture : rejet et absence de numéro', () => {
  const groupes = groupBillingDocumentsByFacture([
    doc({ number: '', payable: 10000, paid: 0, rejected: 10000 }),
  ]);
  expect(groupes[0].number).toBe('SANS_NUMERO');
  expect(groupes[0].statut).toBe('Rejeté');
  expect(groupes[0].remaining).toBe(0);
});
