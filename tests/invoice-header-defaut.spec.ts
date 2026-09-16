import { expect, test } from '@playwright/test';
import type { Company, Invoice, Patient, TicketSettings } from '../src/types';
import { salfaCompanyMonthlyInvoiceHtml, salfaIndividualInvoiceHtml } from '../src/utils/printSalfaInvoice';

/** Réglages d'impression minimaux : l'en-tête personnalisé reste désactivé. */
const settings = { currency: 'Ar', facilityName: 'SALFA' } as unknown as TicketSettings;

const patient = { id: 'pat-1', lastName: 'RAKOTO', firstName: 'TEST' } as unknown as Patient;
const company = { id: 'soc-1', name: 'ASSURANCE COMMUNE', paymentMode: 'Crédit' } as unknown as Company;

const facture = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1', patientId: 'pat-1', clientType: 'comptoir', clientName: 'RAKOTO TEST',
  items: [
    { description: 'PARACETAMOL 500 mg', quantity: 3, unitPrice: 1200, amount: 3600, category: 'pharmacy' },
  ] as Invoice['items'],
  totalAmount: 3600, patientCharge: 3600, status: 'paid', createdAt: '2026-09-10T08:00:00.000Z',
  isExternal: false, numeroFacture: '26FA09101', ...overrides,
});

const a5 = () => salfaIndividualInvoiceHtml(settings, facture(), patient);
const a4 = () => salfaCompanyMonthlyInvoiceHtml(
  settings, company, [facture({ clientType: 'societe' })], 'Septembre 2026', 'FA-09/AC/26-001', [patient],
);

test('les en-têtes par défaut A5 et A4 portent exactement les mêmes mentions', () => {
  for (const html of [a5(), a4()]) {
    // Identité de l'établissement, commune aux deux formats.
    expect(html).toContain('FIANGONANA LOTERANA MALAGASY');
    expect(html).toContain('(EGLISE LUTHERIENNE MALGACHE - MALAGASY LUTHERAN CHURCH)');
    expect(html).toContain("SAMPAN'ASA LOTERANA MOMBA NY FAHASALAMANA");
    expect(html).toContain('DEPARTEMENT DE SANTE - HEALTH DEPARTMENT');

    // Mentions légales complètes et identiques : NIF, STAT (non tronqué) et e-mail.
    expect(html).toContain('NIF: 5000767080 &nbsp; STAT: 851 125 120 120 001 36');
    expect(html).toContain('E-mail: salfa.tulear@gmail.com');
    expect(html).not.toContain('001FIANGONANA'); // ancien STAT tronqué et pollué
    expect(html).not.toContain('STAT: 851 125 120 120 001<');

    // Un seul en-tête par document : pas de doublon d'identité en pied de page.
    expect((html.match(/FIANGONANA LOTERANA MALAGASY/g) || []).length).toBe(1);
    expect((html.match(/NIF: 5000767080/g) || []).length).toBe(1);
  }

  // Spécificités de chaque format, conservées.
  expect(a5()).toContain('DISPENSAIRE TANAMBAO - TOBY BETELA TOLIARA');
  expect(a4()).toContain('SYNODAM-PARITANY FIHERENANA TOLIARA');
  expect(a4()).toContain('HOPITALY LOTERANA TOLIARY TANAMBAO');
});
