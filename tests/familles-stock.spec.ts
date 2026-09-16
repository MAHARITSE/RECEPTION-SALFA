import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Article, Company, Famille, Invoice, Patient, TicketSettings, Vente, VenteLine } from '../src/types';
import type { AppState } from '../src/store';
import {
  ARTICLE_FAMILIES,
  DEFAULT_FAMILLES,
  FAMILLE_AUTRES,
  familleLigneVente,
  familleVente,
  familyLabel,
  familyManagesStock,
  getArticleFamilyCatalog,
  isConsultFamily,
  isMedicationEntryFamily,
  normalizeFamilyBases,
  normalizeFamilyCode,
  normalizeVenteFamilies,
  type EtatFamilles,
} from '../src/utils/familles';
import { salfaCompanyMonthlyInvoiceHtml, salfaIndividualInvoiceHtml } from '../src/utils/printSalfaInvoice';
import { individualBillingPrintHtml, mergedBillingPrintHtml } from '../src/modules/assurance/printBilling';
import type { BillingDocument } from '../src/modules/assurance/monthlyBilling';

/* -------------------------------------------------------------------------- */
/*  Familles : catalogue, gestion du stock, rattachement des ventes            */
/* -------------------------------------------------------------------------- */

const article = (overrides: Partial<Article> = {}): Article => ({
  id: 'art-1', name: 'PARACETAMOL 500 mg', family: 'MEDIC', unit: 'comprimé',
  stockCentral: 100, stockPharmacie: 40, priceExterne: 1000,
  ...overrides,
} as unknown as Article);

const ligne = (overrides: Partial<VenteLine> = {}): VenteLine => ({
  id: 'l-1', venteId: 'v-1', articleName: 'PARACETAMOL 500 mg', quantity: 2,
  unitPrice: 1000, discount: 0, category: 'pharmacy', ...overrides,
} as unknown as VenteLine);

/** Base minimale : deux médicaments, un acte de laboratoire, un article non classé. */
const etat = (overrides: Partial<EtatFamilles> = {}): EtatFamilles => ({
  familles: [],
  articles: [
    article({ id: 'art-1', name: 'PARACETAMOL 500 mg', family: 'MEDIC' }),
    article({ id: 'art-2', name: 'AMOXICILLINE 1 g', family: 'MEDIC' }),
    article({ id: 'art-3', name: 'Glycémie à jeun', family: 'LABO' }),
    article({ id: 'art-4', name: 'Consommable divers', family: '' }),
  ],
  venteLines: [],
  ventes: [],
  ...overrides,
});

test('le catalogue contient Consultation et Autres, et seuls les médicaments sont gérés en stock', () => {
  const codes = DEFAULT_FAMILLES.map(f => f.code);
  expect(codes).toEqual(['MEDIC', 'CONSULT', 'LABO', 'ECHO', 'HOSP', 'DENT', 'AUTRES']);
  expect(ARTICLE_FAMILIES).toEqual(codes);

  // Les deux familles demandées existent avec leur libellé français.
  expect(DEFAULT_FAMILLES.find(f => f.code === 'CONSULT')).toMatchObject({ name: 'Consultation' });
  expect(DEFAULT_FAMILLES.find(f => f.code === 'AUTRES')).toMatchObject({ name: 'Autres' });
  expect(familyLabel('CONSULT')).toBe('Consultation');
  expect(familyLabel('AUTRES')).toBe('Autres');

  // SEULE la famille Médicaments porte manageStock: true dans le catalogue par défaut.
  expect(DEFAULT_FAMILLES.filter(f => f.manageStock === true).map(f => f.code)).toEqual(['MEDIC']);
  expect(DEFAULT_FAMILLES.filter(f => f.manageStock === false).map(f => f.code))
    .toEqual(['CONSULT', 'LABO', 'ECHO', 'HOSP', 'DENT', 'AUTRES']);

  expect(familyManagesStock('MEDIC')).toBe(true);
  for (const code of ['CONSULT', 'LABO', 'ECHO', 'HOSP', 'DENT', 'AUTRES', 'INCONNUE', undefined, '']) {
    expect(familyManagesStock(code)).toBe(false);
  }

  // Un réglage manuel explicite reste prioritaire sur le défaut de la famille.
  const familles: Famille[] = [
    { id: 'f1', code: 'MEDIC', name: 'Médicaments', color: '#000', manageStock: false },
    { id: 'f2', code: 'DENT', name: 'Dentaire', color: '#000', manageStock: true },
  ];
  expect(familyManagesStock('MEDIC', familles)).toBe(false);
  expect(familyManagesStock('DENT', familles)).toBe(true);

  // Une ancienne base sans drapeau manageStock hérite du défaut du catalogue :
  // les médicaments restent gérés, les actes ne le deviennent pas.
  const ancienne: Famille[] = [
    { id: 'a1', code: 'MEDIC', name: 'Médicaments', color: '#000' },
    { id: 'a2', code: 'LAB', name: 'Laboratoire', color: '#000' },
    { id: 'a3', code: 'DENT', name: 'Dentaire', color: '#000' },
  ];
  expect(familyManagesStock('MEDIC', ancienne)).toBe(true);
  expect(familyManagesStock('LABO', ancienne)).toBe(false);
  expect(familyManagesStock('DENT', ancienne)).toBe(false);
  const catalogue = getArticleFamilyCatalog(ancienne);
  expect(catalogue.find(f => f.code === 'MEDIC')?.manageStock).toBe(true);
  expect(catalogue.find(f => f.code === 'LABO')?.manageStock).toBe(false);
  expect(catalogue.find(f => f.code === 'DENT')?.manageStock).toBe(false);
});

test('une consultation est un acte : jamais une entrée de stock médicamenteuse', () => {
  expect(isConsultFamily('CONSULT')).toBe(true);
  expect(isConsultFamily('consultation')).toBe(true);
  expect(isConsultFamily('CONS')).toBe(true);
  expect(isConsultFamily('MEDIC')).toBe(false);

  // Les actes purs ne sont pas prescriptibles comme des médicaments.
  for (const code of ['CONSULT', 'LABO', 'ECHO', 'HOSP']) {
    expect(isMedicationEntryFamily(code)).toBe(false);
  }
  expect(isMedicationEntryFamily('MEDIC')).toBe(true);
});

test('chaque article vendu appartient à une famille', () => {
  const s = etat();

  // 1) famille de l'article retrouvé par identifiant, puis par nom exact ;
  expect(familleLigneVente(s, { articleId: 'art-3', articleName: 'inconnu', category: 'pharmacy' })).toBe('LABO');
  expect(familleLigneVente(s, { articleName: 'Glycémie à jeun', category: 'pharmacy' })).toBe('LABO');
  expect(familleLigneVente(s, ligne({}))).toBe('MEDIC');

  // 2) à défaut, famille déduite de la catégorie de caisse ;
  const parCategorie: Record<string, string> = {
    pharmacy: 'MEDIC', consultation: 'CONSULT', lab: 'LABO', echo: 'ECHO',
    surgery: 'HOSP', hospitalization: 'HOSP', hospitalisation: 'HOSP', bloc: 'HOSP', externe: 'AUTRES',
  };
  for (const [category, attendue] of Object.entries(parCategorie)) {
    expect(familleLigneVente(s, { articleName: 'Acte sans article', category })).toBe(attendue);
  }

  // 3) en dernier recours « Autres » — jamais de ligne sans famille ;
  expect(familleLigneVente(s, { articleName: 'Prestation inconnue' })).toBe(FAMILLE_AUTRES);
  expect(familleLigneVente(s, {})).toBe(FAMILLE_AUTRES);

  // 4) une famille déjà enregistrée sur la ligne est conservée telle quelle.
  expect(familleLigneVente(s, ligne({ family: 'DENT', category: 'pharmacy' }))).toBe('DENT');
});

test('toute vente est rattachée à une famille : commune, dominante, puis Autres', () => {
  const s = etat();

  // Vente d'une seule famille.
  expect(familleVente(s, [ligne({})])).toBe('MEDIC');
  expect(familleVente(s, [ligne({ articleName: 'Glycémie à jeun', category: 'lab' })])).toBe('LABO');
  expect(familleVente(s, [{ articleName: 'Consultation Générale', category: 'consultation', quantity: 1, unitPrice: 10000 }])).toBe('CONSULT');

  // Vente mixte : la famille dominante en montant l'emporte.
  expect(familleVente(s, [
    { articleName: 'Consultation Générale', category: 'consultation', quantity: 1, unitPrice: 10000 },
    ligne({ articleName: 'AMOXICILLINE 1 g', quantity: 1, unitPrice: 25000 }),
  ])).toBe('MEDIC');
  expect(familleVente(s, [
    { articleName: 'Consultation Générale', category: 'consultation', quantity: 1, unitPrice: 40000 },
    ligne({ articleName: 'AMOXICILLINE 1 g', quantity: 1, unitPrice: 25000 }),
  ])).toBe('CONSULT');

  // Montants égaux : le nombre de lignes départage, puis l'ordre du catalogue.
  expect(familleVente(s, [
    { articleName: 'Consultation Générale', category: 'consultation', quantity: 1, unitPrice: 10000 },
    ligne({ articleName: 'AMOXICILLINE 1 g', quantity: 1, unitPrice: 5000 }),
    ligne({ id: 'l-2', articleName: 'PARACETAMOL 500 mg', quantity: 1, unitPrice: 5000 }),
  ])).toBe('MEDIC');
  expect(familleVente(s, [
    { articleName: 'Consultation Générale', category: 'consultation', quantity: 1, unitPrice: 10000 },
    ligne({ articleName: 'AMOXICILLINE 1 g', quantity: 1, unitPrice: 10000 }),
  ])).toBe('MEDIC'); // ordre du catalogue : Médicaments avant Consultation

  // La remise est prise en compte dans le poids de chaque famille.
  expect(familleVente(s, [
    { articleName: 'Consultation Générale', category: 'consultation', quantity: 1, unitPrice: 10000 },
    ligne({ articleName: 'AMOXICILLINE 1 g', quantity: 1, unitPrice: 12000, discount: 50 }),
  ])).toBe('CONSULT');

  expect(familleVente(s, [])).toBe(FAMILLE_AUTRES);
});

test('une base existante est complétée : nouvelles familles, articles et ventes rattachés', () => {
  // Ancienne base à 5 familles (dont l'ancien code LAB) et un article non classé.
  const ancienne: EtatFamilles = {
    familles: [
      { id: 'fam-medic', code: 'MEDIC', name: 'Médicaments', color: '#0D47A1', order: 1 },
      { id: 'fam-lab', code: 'LAB', name: 'Laboratoire', color: '#10B981', order: 2 },
      { id: 'fam-echo', code: 'ECHO', name: 'Échographie', color: '#F59E0B', order: 3 },
      { id: 'fam-hosp', code: 'HOSP', name: 'Hospitalisation', color: '#F97316', order: 4, manageStock: false },
      { id: 'fam-dent', code: 'DENT', name: 'Dentaire', color: '#8B5CF6', order: 5 },
    ],
    articles: [
      article({ id: 'art-1', family: 'MEDIC' }),
      article({ id: 'art-5', name: 'Gants dentaires', family: 'DENT' }),
      article({ id: 'art-9', name: 'Sans famille', family: '' }),
    ],
    ventes: [
      { id: 'v-1' } as unknown as Vente,
      { id: 'v-2', family: 'DENT' } as unknown as Vente,
      { id: 'v-3', family: 'XYZ' } as unknown as Vente, // code inconnu : à corriger
    ],
    venteLines: [
      ligne({ id: 'l-1', venteId: 'v-1', articleId: 'art-1' }),
      ligne({ id: 'l-2', venteId: 'v-2', articleId: 'art-5', articleName: 'Gants dentaires', category: 'externe' }),
      ligne({ id: 'l-3', venteId: 'v-3', articleName: 'Consultation Générale', category: 'consultation', family: 'XYZ' }),
    ],
  };

  const normalisee = normalizeFamilyBases(ancienne);
  expect(normalisee.familles!.map(f => f.code)).toEqual(['MEDIC', 'CONSULT', 'LABO', 'ECHO', 'HOSP', 'DENT', 'AUTRES']);
  expect(normalizeFamilyCode('LAB')).toBe('LABO');
  // Chaque article appartient à une famille : l'article non classé tombe dans « Autres ».
  expect(normalisee.articles!.map(a => a.family)).toEqual(['MEDIC', 'DENT', FAMILLE_AUTRES]);

  const rattachee = normalizeVenteFamilies(normalisee);
  expect(rattachee.venteLines!.map(l => l.family)).toEqual(['MEDIC', 'DENT', 'CONSULT']);
  // v-2 conserve sa famille connue ; v-1 et v-3 (code inconnu) reçoivent celle de leurs lignes.
  expect(rattachee.ventes!.map(v => v.family)).toEqual(['MEDIC', 'DENT', 'CONSULT']);

  // Idempotent : une seconde passe ne recrée pas d'objets (détection de changement
  // par référence pour la sauvegarde différentielle).
  expect(normalizeVenteFamilies(rattachee)).toBe(rattachee);
  expect(normalizeVenteFamilies({ familles: [], articles: [], ventes: [], venteLines: [] })).toMatchObject({ ventes: [] });
});

/* -------------------------------------------------------------------------- */
/*  Données de démonstration régénérées (3 mois)                               */
/* -------------------------------------------------------------------------- */

function demoData() {
  return JSON.parse(readFileSync(new URL('../src/data/localData.json', import.meta.url), 'utf8')) as AppState;
}

test('données 3 mois : familles, stock réservé aux médicaments, ventes rattachées', () => {
  const state = demoData();

  // Catalogue de familles enregistré dans les données par défaut.
  expect(state.familles.map(f => f.code)).toEqual(['MEDIC', 'CONSULT', 'LABO', 'ECHO', 'HOSP', 'DENT', 'AUTRES']);
  expect(state.familles.filter(f => f.manageStock === true).map(f => f.code)).toEqual(['MEDIC']);

  // Chaque article appartient à une famille ; seuls les médicaments portent du stock.
  expect(state.articles.length).toBeGreaterThan(0);
  expect(state.articles.filter(a => !String(a.family || '').trim())).toEqual([]);
  expect(state.articles.filter(a => a.family !== 'MEDIC' && (a.stockPharmacie > 0 || a.stockCentral > 0))).toEqual([]);
  const medicaments = state.articles.filter(a => a.family === 'MEDIC');
  expect(medicaments.length).toBeGreaterThan(0);
  // Un médicament vendu doit avoir du stock : aucune référence à zéro en pharmacie.
  expect(medicaments.filter(a => a.stockPharmacie <= 0)).toEqual([]);

  // Toutes les lignes vendues et toutes les ventes portent une famille.
  expect(state.venteLines.length).toBeGreaterThan(0);
  expect(state.venteLines.filter(l => !l.family)).toEqual([]);
  expect(state.ventes.filter(v => !v.family)).toEqual([]);

  // La famille de chaque vente est bien celle de ses lignes (règle applicative).
  const lignesParVente = new Map<string, VenteLine[]>();
  for (const l of state.venteLines) {
    const lot = lignesParVente.get(l.venteId) || [];
    lot.push(l);
    lignesParVente.set(l.venteId, lot);
  }
  const incoherentes = state.ventes.filter(v =>
    familleVente(state, lignesParVente.get(v.id) || []) !== v.family);
  expect(incoherentes.map(v => v.numeroFacture)).toEqual([]);

  // Aucune ligne n'est en contradiction avec l'article du catalogue.
  const contradictoires = state.venteLines.filter(l => familleLigneVente(state, l) !== l.family);
  expect(contradictoires.map(l => l.articleName)).toEqual([]);

  // La fenêtre couvre bien les trois derniers mois et se termine aujourd'hui.
  const dates = state.ventes.map(v => v.dateVente).sort();
  expect(dates[0].slice(0, 10)).toBe('2026-06-17');
  expect(dates[dates.length - 1].slice(0, 10)).toBe('2026-09-16');
});

/* -------------------------------------------------------------------------- */
/*  Largeurs de colonnes : Qté = Prix = Montant = case des totaux              */
/* -------------------------------------------------------------------------- */

const settings = { currency: 'Ar', facilityName: 'SALFA' } as unknown as TicketSettings;

const factureA5 = (overrides: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1', patientId: 'pat-1', clientType: 'comptoir', clientName: 'RAKOTO TEST',
  items: [
    { description: 'PARACETAMOL 500 mg', quantity: 3, unitPrice: 1200, amount: 3600, category: 'pharmacy' },
    { description: 'Consultation Générale', quantity: 1, unitPrice: 10000, amount: 10000, category: 'consultation' },
  ] as Invoice['items'],
  totalAmount: 13600, patientCharge: 13600, status: 'paid', createdAt: '2026-09-10T08:00:00.000Z',
  isExternal: false, numeroFacture: '26FA09101', ...overrides,
});

const patient = { id: 'pat-1', lastName: 'RAKOTO', firstName: 'TEST' } as unknown as Patient;

test('facture A5 : Qté, Prix, Montant et la case des totaux ont la même largeur', () => {
  const html = salfaIndividualInvoiceHtml(settings, factureA5(), patient);

  // Les deux tableaux imposent leurs largeurs de colonnes (table-layout: fixed).
  expect(html).toMatch(/table\.invoice-table \{[^}]*table-layout: fixed;/);
  expect(html).toMatch(/table\.summary-table \{[^}]*table-layout: fixed;/);

  // Colonnes numériques du détail : 90 px, identiques pour Qté / Prix / Montant.
  expect(html).toMatch(/table\.invoice-table th\.num, table\.invoice-table td\.num \{\s*width: 90px;/);
  expect(html).toMatch(/<th class="num">\s*Qté\s*<\/th>\s*<th class="num">\s*Prix\s*<\/th>\s*<th class="num">\s*Montant\s*<\/th>/);

  // Récapitulatif : le libellé prend 130 px, la case du montant 90 px — soit la
  // même largeur que les colonnes numériques du tableau, donc un alignement vertical.
  expect(html).toMatch(/table\.summary-table td\.lbl \{\s*width: 130px;/);
  expect(html).toMatch(/table\.summary-table td\.val \{\s*width: 90px;/);

  // Chaque ligne du détail porte bien les trois cases numériques.
  const cells = html.match(/<td class="num"/g) || [];
  expect(cells.length).toBe(6); // 2 articles × (Qté, Prix, Montant)
  const vals = html.match(/<td class="val"/g) || [];
  expect(vals.length).toBeGreaterThan(0); // Total brut / réduction / net à payer
});

test('facture société A4 : Montant, Participation et Net à Payer de même largeur', () => {
  const company = { id: 'soc-1', name: 'ASSURANCE COMMUNE', paymentMode: 'Crédit' } as unknown as Company;
  const html = salfaCompanyMonthlyInvoiceHtml(
    settings, company, [factureA5({ clientType: 'societe' })], 'Septembre 2026', 'FA-09/AC/26-001', [patient],
  );
  expect(html).toMatch(/<th style="width: 90px;">Montant<\/th>/);
  expect(html).toMatch(/<th style="width: 90px;">Participat°<\/th>/);
  expect(html).toMatch(/<th style="width: 90px;">Net à Payer<\/th>/);
});

const documentFacturation = (overrides: Partial<BillingDocument> = {}): BillingDocument => ({
  id: 'caisse:inv-1', sourceId: 'inv-1', category: 'comptoir', number: '26FA09101',
  date: '2026-09-10', client: 'RAKOTO TEST', individualGross: 13600, individualNet: 13600,
  total: 13600, copay: 0, payable: 13600, paid: 13600, rejected: 0,
  items: [
    { description: 'PARACETAMOL 500 mg', actCode: 'MEDIC', quantity: 3, unitPrice: 1200, amount: 3600 },
    { description: 'Consultation Générale', actCode: 'CONSULT', quantity: 1, unitPrice: 10000, amount: 10000 },
  ],
  ...overrides,
} as unknown as BillingDocument);

const etatFacturation = {
  ticketSettings: settings,
  companies: [], patients: [patient], familles: DEFAULT_FAMILLES, articles: [], invoices: [],
  ventes: [], venteLines: [], ventePayments: [], companyBillingAccounts: [], cashClosings: [],
  assuranceSocietes: [], assurancePersonnes: [], assuranceFamilles: [], assurancePrestations: [],
  assurancePaiements: [],
} as unknown as AppState;

test('facturation assurance A4 : les trois colonnes chiffrées font 18 % et la case du total aussi', () => {
  // Modèle individuel : 5 / 41 / 18 / 18 / 18.
  const individuel = individualBillingPrintHtml(etatFacturation, documentFacturation());
  expect(individuel).toContain('<col style="width:5%"><col style="width:41%"><col style="width:18%"><col style="width:18%"><col style="width:18%">');
  // Le bloc des totaux fait 40 % de la page et son libellé 55 % : la case du
  // montant occupe donc 40 % × 45 % = 18 % de la page, comme Qté / Prix / Montant.
  expect(individuel).toContain('.individual .totals{width:40%;margin-left:60%}');
  expect(individuel).toContain('.individual .totals th{width:55%}');

  // Modèle fusionné : 6 / 40 / 18 / 18 / 18 et totaux à 62 % × 29 % = 18 %.
  const fusion = mergedBillingPrintHtml(etatFacturation, [documentFacturation()], 'RAKOTO TEST');
  expect(fusion).toContain('<col style="width:6%"><col style="width:40%"><col style="width:18%"><col style="width:18%"><col style="width:18%">');
  expect(fusion).toContain('.fusion .totals{width:62%;margin-left:38%');
  expect(fusion).toContain('.fusion .totals th{width:71%}');
});
