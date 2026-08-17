import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { collectPrintedHtml } from './setup';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loginAs(userId: string, password: string) {
  const personnelBtn = await screen.findByRole('button', { name: /Personnel/ });
  await userEvent.click(personnelBtn);
  const select = await screen.findByRole('combobox');
  await userEvent.selectOptions(select, userId);
  const pwd = screen.getByPlaceholderText('••••••••');
  await userEvent.type(pwd, password);
  await userEvent.click(screen.getByRole('button', { name: /Se connecter/ }));
}

describe('Flux médecin → caisse', () => {
  it("la consultation validée par le médecin arrive dans la file d'attente de paiement de la caisse", async () => {
    render(<App />);
    await loginAs('USR-DOC', 'doc123');

    // Sélection du patient dans la file du médecin
    await userEvent.click(await screen.findByText('MBOLA Tiana'));

    // Diagnostic
    const diag = await screen.findByPlaceholderText('Diagnostic * (obligatoire)');
    await userEvent.type(diag, 'Paludisme');

    // Ajout d'une analyse labo (NFS)
    const labSearch = await screen.findByPlaceholderText('Rechercher analyse (NFS, Glycémie...) ↑↓ ↵');
    await userEvent.type(labSearch, 'NFS');
    await userEvent.click(await screen.findByText(/NFS \(Numération Formule Sanguine\)/));

    // Valider la consultation
    const valider = screen.getByRole('button', { name: /Valider/ });
    await userEvent.click(valider);

    // Retour à la file médecin : le patient garde le statut « Attente Paiement »
    await waitFor(async () => {
      const badges = await screen.findAllByText('Attente Paiement');
      expect(badges.length).toBeGreaterThan(0);
    });

    // Déconnexion puis connexion caisse
    await userEvent.click(screen.getByRole('button', { name: /Déconnexion/ }));
    await loginAs('USR-CASH', 'caisse123');

    // File d'attente de paiement : le patient doit y être, avec le montant de l'analyse
    await screen.findByText("File d'attente de paiement");
    await waitFor(async () => {
      expect(screen.getByText('MBOLA Tiana')).toBeTruthy();
    });
    expect(screen.getByText(/15\s?000,00 Ar/)).toBeTruthy();

    // Ouvrir la facture et encaisser
    await userEvent.click(screen.getByText('MBOLA Tiana'));
    await screen.findByText('À PAYER');
    const encaisserBtns = await screen.findAllByRole('button', { name: /Encaisser/ });
    // La modale de facturation est la dernière rendue dans le DOM
    await userEvent.click(encaisserBtns[encaisserBtns.length - 1]);

    // Le ticket caisse ET le bon d'analyse doivent être imprimés
    await sleep(3000);
    const printed = collectPrintedHtml();
    expect(printed.some((h) => h.includes('BON D\u2019ANALYSE') || h.includes('BON D\'ANALYSE'))).toBe(true);
  }, 90000);

  it("la vente externe d'une analyse LABO à la caisse imprime le bon d'analyse et transmet la demande au laboratoire", async () => {
    render(<App />);
    await loginAs('USR-CASH', 'caisse123');

    await screen.findByText('Vente Directe — Client Externe');

    // Saisie d'un article d'analyse (famille LABO) dans la vente externe
    const artSearch = screen.getByPlaceholderText('🔍 Tapez...');
    await userEvent.type(artSearch, 'NFS');
    await userEvent.click(await screen.findByText(/NFS \(Numération Formule Sanguine\)/));
    // Enregistrer la ligne (draft → liste)
    await userEvent.click(screen.getByRole('button', { name: /Enreg\./ }));

    // La ligne doit être ajoutée (pas d'alerte rupture pour un examen)
    await waitFor(async () => {
      const rows = await screen.findAllByText(/NFS \(Numération Formule Sanguine\)/);
      expect(rows.length).toBeGreaterThan(0);
    });
    const amounts = await screen.findAllByText(/18\s?000,00 Ar/);
    expect(amounts.length).toBeGreaterThan(0);

    // Encaisser
    await userEvent.click(screen.getByRole('button', { name: /Encaisser/ }));

    // Ticket caisse + bon d'analyse imprimés
    await sleep(3500);
    const printed = collectPrintedHtml();
    expect(printed.some((h) => h.includes('BON D\u2019ANALYSE') || h.includes('BON D\'ANALYSE'))).toBe(true);

    // La demande arrive au laboratoire avec le statut « payé » (vente encaissée)
    const raw = localStorage.getItem('reception_salfa_state_v1') || '{}';
    const state = JSON.parse(raw).state || {};
    const nfs = (state.labRequests || []).find((l: any) => l.examType.includes('NFS') && l.status === 'paid');
    expect(nfs).toBeTruthy();
    expect(nfs.price).toBe(18000);
  }, 90000);

  it("la vente externe d'une échographie imprime le bon d'échographie", async () => {
    render(<App />);
    await loginAs('USR-CASH', 'caisse123');

    await screen.findByText('Vente Directe — Client Externe');

    const artSearch = screen.getByPlaceholderText('🔍 Tapez...');
    await userEvent.type(artSearch, 'échographie abdominale');
    await userEvent.click(await screen.findByText(/Échographie abdominale/));
    await userEvent.click(screen.getByRole('button', { name: /Enreg\./ }));

    await userEvent.click(screen.getByRole('button', { name: /Encaisser/ }));

    await sleep(3500);
    const printed = collectPrintedHtml();
    expect(printed.some((h) => h.includes('BON D\u2019ÉCHOGRAPHIE') || h.includes('BON D\'ÉCHOGRAPHIE'))).toBe(true);

    // L'échographie est rattachée à la consultation externe avec le statut payé
    const raw = localStorage.getItem('reception_salfa_state_v1') || '{}';
    const state = JSON.parse(raw).state || {};
    const extConsult = (state.consultations || []).find((c: any) => c.diagnosis === 'Client Externe' && (c.echoRequests || []).length > 0);
    expect(extConsult).toBeTruthy();
    expect(extConsult.echoRequests[0].status).toBe('paid');
  }, 90000);

  it('un examen LABO ne déclenche pas le contrôle de stock (prestation sans stock)', async () => {
    render(<App />);
    await loginAs('USR-CASH', 'caisse123');
    await screen.findByText('Vente Directe — Client Externe');
    const artSearch = screen.getByPlaceholderText('🔍 Tapez...');
    await userEvent.type(artSearch, 'NFS');
    // L'option apparaît sans badge RUPTURE bloquant : le clic ajoute le brouillon
    await userEvent.click(await screen.findByText(/NFS \(Numération Formule Sanguine\)/));
    // L'input affiche désormais l'article sélectionné (draft prêt à enregistrer)
    await waitFor(async () => {
      const inputs = await screen.findAllByDisplayValue(/NFS \(Numération Formule Sanguine\)/);
      expect(inputs.length).toBeGreaterThan(0);
    });
  }, 90000);

  it("les saisies d'un autre poste (médecin) arrivent dans la file d'attente de la caisse sans rechargement", async () => {
    render(<App />);
    await loginAs('USR-CASH', 'caisse123');
    await screen.findByText("File d'attente de paiement");
    expect(screen.queryByText('RAZAFY Nouveau')).toBeNull();

    // Simule un AUTRE poste (le médecin valide une consultation avec analyse labo)
    const raw = localStorage.getItem('reception_salfa_state_v1') || '{}';
    const stored = JSON.parse(raw);
    const state = stored.state;
    const now = new Date().toISOString();
    state.patients.push({
      id: 'pat-sync-test', dossier: 'D-SYNC', firstName: 'Nouveau', lastName: 'RAZAFY',
      dateOfBirth: '', age: '30', gender: 'M', address: '', contact: '', ssn: '',
      clientType: 'comptoir', allergies: [], chronicTreatments: [], antecedents: [],
      registeredAt: now, registeredBy: 'RECEPTION', status: 'consulted_awaiting_payment',
    });
    state.consultations.push({
      id: 'consult-sync-test', patientId: 'pat-sync-test', doctorId: 'USR-DOC', doctorName: 'Dr. Feno Rasoana',
      date: now, visitReason: 'Test', diagnosis: 'Paludisme',
      prescriptions: [], labRequests: [], echoRequests: [],
      hospitalizeRequested: false, surgeryRequested: false, isEmergency: false,
      vitalSigns: { temperature: '', bloodPressureSystolic: '', bloodPressureDiastolic: '', heartRate: '', oxygenSaturation: '', weight: '', height: '' },
      notes: '',
    });
    state.invoices.push({
      id: 'inv-sync-test', patientId: 'pat-sync-test', consultationId: 'consult-sync-test', clientType: 'comptoir',
      items: [{ description: 'NFS (Numération Formule Sanguine)', amount: 15000, category: 'lab' }],
      totalAmount: 15000, patientCharge: 15000, status: 'pending', createdAt: now, isExternal: false,
    });
    state.labRequests.push({
      id: 'lab-sync-test', patientId: 'pat-sync-test', consultationId: 'consult-sync-test',
      examType: 'NFS (Numération Formule Sanguine)', parameters: [], urgent: false,
      status: 'pending', invoiceId: 'inv-sync-test', price: 15000,
    });
    localStorage.setItem('reception_salfa_state_v1', JSON.stringify(stored));
    window.dispatchEvent(new StorageEvent('storage', { key: 'reception_salfa_state_v1' }));

    // La file d'attente de paiement doit se mettre à jour SANS recharger la page
    await waitFor(async () => {
      expect(screen.getByText('RAZAFY Nouveau')).toBeTruthy();
    }, { timeout: 5000 });
    const amounts = await screen.findAllByText(/15\s?000,00 Ar/);
    expect(amounts.length).toBeGreaterThan(0);
  }, 90000);

  it("la demande d'analyse externe arrive dans la file d'attente du laboratoire", async () => {
    render(<App />);
    await loginAs('USR-CASH', 'caisse123');
    await screen.findByText('Vente Directe — Client Externe');
    const artSearch = screen.getByPlaceholderText('🔍 Tapez...');
    await userEvent.type(artSearch, 'NFS');
    await userEvent.click(await screen.findByText(/NFS \(Numération Formule Sanguine\)/));
    await userEvent.click(screen.getByRole('button', { name: /Enreg\./ }));
    await userEvent.click(screen.getByRole('button', { name: /Encaisser/ }));
    await waitFor(async () => {
      const raw = localStorage.getItem('reception_salfa_state_v1') || '{}';
      const state = JSON.parse(raw).state || {};
      const nfs = (state.labRequests || []).find((l: any) => l.examType.includes('NFS') && l.status === 'paid' && !l.patientId);
      expect(nfs).toBeTruthy();
    });

    // Connexion laboratoire : la demande externe est dans la file « En attente »
    await userEvent.click(screen.getByRole('button', { name: /Déconnexion/ }));
    await loginAs('USR-LAB', 'labo123');
    await waitFor(async () => {
      const ext = await screen.findAllByText('Patient externe');
      expect(ext.length).toBeGreaterThan(0);
    });
  }, 90000);
});