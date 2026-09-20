import { expect, test } from '@playwright/test';
import type { AppState } from '../src/store';
import {
  clefArticle, medicamentsDejaSurFacture, piecesSelectionnees, prochaineSelection, purgePieceFromQueue,
  separerOrdonnanceDeLaFacture,
} from '../src/utils/caisseFileAttente';
import type { Consultation, Invoice, LabRequest } from '../src/types';

/**
 * FILE D'ATTENTE DE LA CAISSE — FACTURER ET SUPPRIMER PIÈCE PAR PIÈCE.
 *
 * Un même patient peut avoir PLUSIEURS lignes dans la file (une par
 * prescription). Chaque ligne doit pouvoir être encaissée ou retirée
 * INDÉPENDAMMENT : retirer/régler l'une ne doit jamais consommer les autres,
 * et aucune donnée médicale (dossier, ordonnance, examen déjà réalisé) n'est
 * détruite. Ces tests portent sur les fonctions pures de la file :
 * `purgePieceFromQueue` (le bouton ✕ d'une ligne), `piecesSelectionnees` et
 * `prochaineSelection` (les cases de la modale), `medicamentsDejaSurFacture`
 * (une prescription déjà portée par sa facture n'est jamais proposée deux fois).
 */

const lab = (over: Partial<LabRequest> = {}): LabRequest => ({
  id: 'lab-1', patientId: 'pat-1', consultationId: 'cons-1', examType: 'NFS',
  code: 'LAB001', category: 'biochimie', parameters: ['NFS'], urgent: false,
  status: 'pending', requestedAt: '2026-09-18T08:00:00.000Z', ...over,
} as LabRequest);

const consultation = (over: Partial<Consultation> = {}): Consultation => ({
  id: 'cons-1', patientId: 'pat-1', doctorId: 'USR-DOC', doctorName: 'Dr. Feno',
  date: '2026-09-18T08:00:00.000Z', visitReason: 'Fièvre', diagnosis: 'Syndrome grippal',
  notes: '', prescriptions: [{ id: 'p1', articleId: 'art-001', articleName: 'Paracétamol 500mg', quantity: 10, posology: '1 cp x 3/j', duration: '', instructions: '', unitPrice: 450, discount: 0, delivered: false }],
  labRequests: [], hospitalizeRequested: false, surgeryRequested: false, isEmergency: false,
  vitalSigns: { temperature: '38.2' } as Consultation['vitalSigns'],
  ...over,
});

const facture = (over: Partial<Invoice>): Invoice => ({
  id: 'inv-1', patientId: 'pat-1', consultationId: 'cons-1', clientType: 'comptoir',
  items: [], totalAmount: 0, patientCharge: 0, status: 'pending',
  createdAt: '2026-09-18T08:00:00.000Z', isExternal: false, ...over,
} as Invoice);

const base = (over: Partial<AppState> = {}): AppState => ({
  patients: [{ id: 'pat-1', dossier: 'RAS100', lastName: 'RAKOTO', firstName: 'Miora', dateOfBirth: '1990-01-01', age: '36 Ans', gender: 'F', address: '', contact: '', ssn: '', clientType: 'comptoir', allergies: [], chronicTreatments: [], antecedents: [], registeredAt: '2026-09-18T07:00:00.000Z', registeredBy: 'USR-RECEP', status: 'consulted_awaiting_payment' }],
  consultations: [consultation({ id: 'cons-1' })],
  invoices: [],
  labRequests: [],
  issuedFactureNumbers: [],
  ...over,
} as unknown as AppState);

test('sélection du lot : null = tout le dossier, liste = une prescription seule, vide = rien', () => {
  const pieces = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  // Ouverte depuis le dossier : tout est proposé, chaque pièce restant séparée.
  expect(piecesSelectionnees(pieces, null).map(p => p.key)).toEqual(['a', 'b', 'c']);
  // Ouverte depuis UNE ligne de la file : seule cette prescription est encaissée.
  expect(piecesSelectionnees(pieces, ['b']).map(p => p.key)).toEqual(['b']);
  // Rien de coché : le lot est vide, la validation refusera d'encaisser.
  expect(piecesSelectionnees(pieces, [])).toEqual([]);
  // Une clé devenue sans objet (ligne retirée pendant la saisie) est ignorée.
  expect(piecesSelectionnees(pieces, ['b', 'fantome']).map(p => p.key)).toEqual(['b']);
});

test('cocher/décocher une prescription : tout coché vaut « tout le dossier »', () => {
  const toutes = ['a', 'b', 'c'];
  // Recocher la dernière case vide → tout est coché → `null` : le lot suit les
  // pièces réellement en attente du dossier.
  expect(prochaineSelection(toutes, ['a', 'b'], 'c')).toBe(null);
  expect(prochaineSelection(toutes, null, 'a')).toEqual(['b', 'c']);
  // Décocher la dernière case laisse le lot VIDE (et non « tout »).
  expect(prochaineSelection(toutes, ['a', 'b'], 'b')).toEqual(['a']);
  expect(prochaineSelection(toutes, ['a'], 'a')).toEqual([]);
  // Recocher la seule pièce restante du lot ne vaut PAS « tout le dossier ».
  expect(prochaineSelection(toutes, [], 'a')).toEqual(['a']);
});

test('pièce « médicaments » : le retrait ne touche ni les autres ordonnances, ni le dossier médical', () => {
  const state = base({
    consultations: [
      consultation({ id: 'cons-1' }),
      consultation({ id: 'cons-2', date: '2026-09-19T08:00:00.000Z' }),
    ],
  });

  const res = purgePieceFromQueue(state, 'pat-1', { kind: 'medicaments', consultationId: 'cons-1' }, { id: 'USR-CASH', name: 'Caissier 1' });
  expect(res.ok).toBe(true);
  expect(res.montant).toBe(4500); // 450 Ar × 10

  // L'ordonnance retirée reste AU DOSSIER MÉDICAL (prescriptions intactes) et
  // porte le marqueur qui la sort de la file caisse.
  const retiree = state.consultations.find(c => c.id === 'cons-1')!;
  expect(retiree.prescriptions).toHaveLength(1);
  expect(retiree.facturationRetiree?.byName).toBe('Caissier 1');

  // L'autre prescription du MÊME patient reste facturable (retrait indépendant).
  const autre = state.consultations.find(c => c.id === 'cons-2')!;
  expect(autre.facturationRetiree).toBeUndefined();
  expect(state.patients).toHaveLength(1);
});

test('deuxième retrait de la même ligne : refusé, sans effet de bord', () => {
  const state = base();
  expect(purgePieceFromQueue(state, 'pat-1', { kind: 'medicaments', consultationId: 'cons-1' }).ok).toBe(true);
  const second = purgePieceFromQueue(state, 'pat-1', { kind: 'medicaments', consultationId: 'cons-1' });
  expect(second.ok).toBe(false);
  expect(second.raison).toContain('déjà retirée');
});

test('pièce « facture d’analyses » : la facture en attente et ses examens non réalisés partent, le reste reste', () => {
  const labFacture = facture({
    id: 'inv-lab', numeroFacture: '26FA0918007',
    items: [{ description: 'NFS', quantity: 1, unitPrice: 8000, amount: 8000, category: 'lab' }],
    totalAmount: 8000, patientCharge: 8000,
  });
  const echoFacture = facture({
    id: 'inv-echo', consultationId: 'cons-1',
    items: [{ description: 'Échographie abdominale', quantity: 1, unitPrice: 22000, amount: 22000, category: 'echo' }],
    totalAmount: 22000, patientCharge: 22000,
  });
  const facturePayee = facture({ id: 'inv-payee', status: 'paid', paidAt: '2026-09-18T09:00:00.000Z', totalAmount: 4500, patientCharge: 4500 });
  const state = base({
    consultations: [consultation({
      id: 'cons-1',
      labRequests: [lab({ id: 'lab-1' }), lab({ id: 'lab-2', examType: 'CRP', status: 'completed' })],
    })],
    labRequests: [lab({ id: 'lab-1' }), lab({ id: 'lab-2', examType: 'CRP', status: 'completed' })],
    invoices: [labFacture, echoFacture, facturePayee],
  });

  const res = purgePieceFromQueue(state, 'pat-1', { kind: 'facture', invoiceId: 'inv-lab' });
  expect(res.ok).toBe(true);
  expect(res.montant).toBe(8000);

  // La facture retirée a disparu, les AUTRES pièces du dossier restent au guichet.
  expect(state.invoices.map(i => i.id)).toEqual(['inv-echo', 'inv-payee']);
  // L'examen en attente de CETTE facture est retiré avec elle — à la fois dans
  // la table globale et dans la copie rattachée à la consultation — alors que
  // l'examen déjà réalisé (complété) est conservé.
  expect(state.labRequests.map(l => l.id)).toEqual(['lab-2']);
  expect(state.consultations[0].labRequests.map(l => l.id)).toEqual(['lab-2']);
  // Un numéro de facture attribué n'est JAMAIS réattribué : il rejoint le registre.
  expect(state.issuedFactureNumbers).toContain('26FA0918007');
});

test('une facture déjà encaissée ne peut pas être retirée de la file', () => {
  const state = base({
    invoices: [facture({ id: 'inv-payee', status: 'paid', totalAmount: 8000, patientCharge: 8000 })],
  });
  const res = purgePieceFromQueue(state, 'pat-1', { kind: 'facture', invoiceId: 'inv-payee' });
  expect(res.ok).toBe(false);
  expect(res.raison).toContain('déjà encaissée');
  expect(state.invoices).toHaveLength(1);
});

test('retrait d’une pièce d’un autre dossier : refusé', () => {
  const state = base({ invoices: [facture({ id: 'inv-lab', patientId: 'pat-2' })] });
  const res = purgePieceFromQueue(state, 'pat-1', { kind: 'facture', invoiceId: 'inv-lab' });
  expect(res.ok).toBe(false);
  expect(state.invoices).toHaveLength(1);
});

/* ─────────────────────────────────────────────────────────────────────────────
 * ANTI-DOUBLON — une prescription ne doit être présentée une seule fois au
 * guichet. Un dossier dont la FACTURE EN ATTENTE contient déjà les médicaments
 * (facture « globale » : consultation + médicaments + analyses) ne doit pas
 * afficher une seconde ligne pour ces mêmes médicaments : sinon les deux lignes
 * ne sont plus indépendantes (encaisser la globale faisait disparaître la
 * petite) et le patient paierait deux fois le même article.
 * ────────────────────────────────────────────────────────────────────────────*/

const factureGlobale = (over: Partial<Invoice> = {}): Invoice => facture({
  id: 'inv-globale', consultationId: 'cons-3', status: 'pending', totalAmount: 32500, patientCharge: 32500,
  items: [
    { description: 'Consultation Générale', quantity: 1, unitPrice: 13500, amount: 13500, category: 'consultation' },
    { description: 'Oméprazole 20mg', quantity: 1, unitPrice: 1000, amount: 1000, category: 'pharmacy' },
    { description: 'Bilan lipidique complet', quantity: 1, unitPrice: 18000, amount: 18000, category: 'lab' },
  ] as Invoice['items'],
  ...over,
});

test('comptoir : le médicament porté par la facture en attente de sa consultation est reconnu', () => {
  const deja = medicamentsDejaSurFacture([factureGlobale()], { id: 'cons-3', patientId: 'pat-1' });
  expect(deja.has(clefArticle('Oméprazole 20mg'))).toBe(true);
  // Les lignes non pharmacie (consultation, analyse) ne comptent pas : elles
  // n'ont jamais de pièce « ordonnance » correspondante.
  expect(deja.has(clefArticle('Bilan lipidique complet'))).toBe(false);
});

test('la comparaison des libellés ignore la casse, les accents et les espaces', () => {
  const deja = medicamentsDejaSurFacture([factureGlobale()], { id: 'cons-3', patientId: 'pat-1' });
  expect(deja.has(clefArticle('  oméprazole  20MG '))).toBe(true);
});

test('un médicament déjà payé n’est plus jamais redemandé', () => {
  const deja = medicamentsDejaSurFacture(
    [factureGlobale({ status: 'paid' })],
    { id: 'cons-3', patientId: 'pat-1' },
  );
  expect(deja.has(clefArticle('Oméprazole 20mg'))).toBe(true);
});

test('les factures d’une AUTRE consultation ou d’un AUTRE dossier ne masquent rien', () => {
  const factures = [
    factureGlobale({ id: 'inv-autre-consult', consultationId: 'cons-9' }),
    factureGlobale({ id: 'inv-autre-patient', patientId: 'pat-2' }),
  ];
  expect(medicamentsDejaSurFacture(factures, { id: 'cons-3', patientId: 'pat-1' }).size).toBe(0);
});

test('retrait de la facture globale : la prescription réapparaît, rien n’est perdu', () => {
  // La facture qui couvrait les médicaments est retirée de la file (annulée) :
  // `medicamentsDejaSurFacture` ne voit plus rien, la caisse doit donc retrouver
  // le médicament à encaisser au lieu de l'oublier.
  const state = base({
    consultations: [consultation({ id: 'cons-3', prescriptions: [{ id: 'p3', articleId: 'art-003', articleName: 'Oméprazole 20mg', quantity: 1, posology: '1 gél./j', duration: '14 j', instructions: '', unitPrice: 1000, discount: 0, delivered: false }] })],
    invoices: [factureGlobale()],
  });
  const deja = medicamentsDejaSurFacture(state.invoices, { id: 'cons-3', patientId: 'pat-1' });
  expect(deja.has(clefArticle('Oméprazole 20mg'))).toBe(true);

  const res = purgePieceFromQueue(state, 'pat-1', { kind: 'facture', invoiceId: 'inv-globale' });
  expect(res.ok).toBe(true);
  expect(state.invoices).toHaveLength(0);
  expect(medicamentsDejaSurFacture(state.invoices, { id: 'cons-3', patientId: 'pat-1' }).size).toBe(0);
  // L'ordonnance reste au dossier médical : c'est elle qui sera représentée.
  expect(state.consultations[0].prescriptions.map(x => x.articleName)).toEqual(['Oméprazole 20mg']);
});

/* ─────────────────────────────────────────────────────────────────────────────
 * DÉCOUPAGE D'UNE FACTURE « GLOBALE » — une facture legacy peut mélanger
 * consultation, analyses ET médicaments. Pour que chaque prescription reste une
 * LIGNE INDÉPENDANTE de la file (facturable et retirable seule), les lignes qui
 * sont l'ordonnance de la consultation sont sorties de la facture — à
 * l'identique seulement, et jamais au point de vider la facture.
 * ────────────────────────────────────────────────────────────────────────────*/

const L = (description: string, category: string, quantity: number, price: number) =>
  ({ description, category, quantity, unitPrice: price, amount: quantity * price });
const GLOBALE = [
  L('Consultation Générale', 'consultation', 1, 13500),
  L('Oméprazole 20mg', 'pharmacy', 1, 1000),
  L('Bilan lipidique complet', 'lab', 1, 18000),
];
const ORDONNANCE = [L('Oméprazole 20mg', 'pharmacy', 1, 1000)];
const total = (lignes: { amount?: number }[]) => lignes.reduce((ss, l) => ss + (Number(l.amount) || 0), 0);

test('les médicaments de l’ordonnance sortent de la facture globale', () => {
  const { lignes, absorbees, scindee } = separerOrdonnanceDeLaFacture(GLOBALE, ORDONNANCE);
  expect(scindee).toBe(true);
  expect(lignes.map(l => l.description)).toEqual(['Consultation Générale', 'Bilan lipidique complet']);
  expect(total(lignes)).toBe(31500);
  // Rien n'est « absorbé » : l'Oméprazole reste à encaisser sur SA ligne.
  expect([...absorbees]).toEqual([]);
});

test('aucun ariary égaré : la facture découpée + la ligne des médicaments = la facture d’origine', () => {
  const { lignes } = separerOrdonnanceDeLaFacture(GLOBALE, ORDONNANCE);
  expect(total(lignes) + total(ORDONNANCE)).toBe(total(GLOBALE));
});

test('facture entièrement composée des médicaments : pas de découpe, pas de doublon', () => {
  const seulementMedoc = [L('Oméprazole 20mg', 'pharmacy', 1, 1000)];
  const { lignes, absorbees, scindee } = separerOrdonnanceDeLaFacture(seulementMedoc, ORDONNANCE);
  expect(scindee).toBe(false);
  expect(lignes).toEqual(seulementMedoc);
  // La pièce « ordonnance » est absorbée par cette facture : elle ne la redemande pas.
  expect(absorbees.has(clefArticle('Oméprazole 20mg'))).toBe(true);
});

test('ligne seulement SEMBLABLE (quantité ou prix différents) : elle reste sur la facture', () => {
  const factureDifferente = [
    L('Consultation Générale', 'consultation', 1, 13500),
    L('Oméprazole 20mg', 'pharmacy', 3, 1000),
  ];
  const { lignes, absorbees, scindee } = separerOrdonnanceDeLaFacture(factureDifferente, ORDONNANCE);
  expect(scindee).toBe(false);
  expect(lignes.map(l => l.description)).toEqual(['Consultation Générale', 'Oméprazole 20mg']);
  // Et l'ordonnance ne sera pas proposée en plus : déjà portée (autrement) par cette ligne.
  expect(absorbees.has(clefArticle('Oméprazole 20mg'))).toBe(true);
});

test('facture sans médicaments (analyses seules) : rien n’est découpé, les deux lignes restent indépendantes', () => {
  const analyses = [L('NFS', 'lab', 1, 8000), L('Glycémie à jeun', 'lab', 1, 7000)];
  const { lignes, absorbees, scindee } = separerOrdonnanceDeLaFacture(analyses, ORDONNANCE);
  expect(scindee).toBe(false);
  expect(lignes).toEqual(analyses);
  expect(absorbees.size).toBe(0);
});

test('clic sur la prescription de 32 500 Ar ou 1 000 Ar : seule la prescription cliquée passe à la caisse', () => {
  const pieces = [
    { key: 'inv-32500', label: 'Prescription du 16/09/2026', montant: 32500 },
    { key: 'meds-1000', label: 'Prescription du 16/09/2026', montant: 1000 },
  ];
  // Quand on clique sur la prescription de 32 500 Ar (clé 'inv-32500') :
  const selection32500 = piecesSelectionnees(pieces, ['inv-32500']);
  expect(selection32500).toHaveLength(1);
  expect(selection32500[0].key).toBe('inv-32500');
  expect(selection32500[0].montant).toBe(32500);

  // Quand on clique sur la prescription de 1 000 Ar (clé 'meds-1000') :
  const selection1000 = piecesSelectionnees(pieces, ['meds-1000']);
  expect(selection1000).toHaveLength(1);
  expect(selection1000[0].key).toBe('meds-1000');
  expect(selection1000[0].montant).toBe(1000);
});

