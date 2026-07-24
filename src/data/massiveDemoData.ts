/** Jeu de démonstration synthétique, déterministe et sans données personnelles réelles.
 * 50 patients, chacun avec ≥ 3 visites par mois sur les 12 derniers mois.
 * Les IDs sont stables afin que les relations restent identiques à chaque chargement. */
import type { AppState } from '../store';
import type { Article, Company, Consultation, Invoice, LabExamCatalog, Patient, User, Vente, VenteLine, VentePayment } from '../types';

const DAY = 86_400_000;
const END = Date.UTC(2026, 6, 21, 12); // date de référence fixe: reproductible
let seed = 0x51af1a; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const iso = (offset: number) => new Date(END - offset * DAY).toISOString();
const id = (kind: string, n: number) => `${kind}-${String(n).padStart(6, '0')}`;

const first = ['Aina','Hery','Miora','Tiana','Feno','Soa','Lanto','Niry','Voahirana','Tahina','Rija','Mamy','Nomena','Kanto','Fara','Tsiry','Mialy','Hanitra','Tovo','Sitraka','Lova','Mendrika','Ravaka','Tendry','Aro','Lina','Kely','Nivo','Sanda','Miora'];
const last = ['Andriamanitra','Razanakoto','Rakotondrabe','Ravelomanana','Rabetsara','Randrianasolo','Rafalimanana','Rasoazanany','Andriatsilavo','Raharison','Rakotoarisoa','Ramiandrasoa','Razanajatovo','Ravelotiana','Ratsimbazafy','Randriamihaja','Razafindrabe','Ramanantsoa','Andrianjafy','Rakotomalala','Benali','Diallo','Ndlovu','Moreau','Kowalski','Silva','Okafor','Nguyen','Khan','Santos','Mbeki','Adebayo','Muller','Rossi','Tanaka','Haddad','Dubois','Kamara','Adeyemi','Kone','Mendoza','Petrov','Sato','Ibrahim','Costa','Mbele','Fischer','Bello','Martin','Kumar','Park','Kouadio','Traore','Ba','Sow','Keita','Bamba','Osei','Mensah','Asante','Bako','Zongo','Fofana','Diarra','Touré','Cisse','Ouattara','Benyahia','Cherif','Yilmaz','Demir','Popescu','Ionescu','Novak','Horvat','Jensen','Larsen','Svensson','Olsson','Nielsen','Pereira','Ferreira','Almeida','Carvalho','Lopes','Gomes','Vieira','Rodrigues','Castro','Morales','Herrera','Vargas','Rojas','Salazar','Quispe','Flores','Mamani','Sanchez','Lozano','Medina','Cabrera'];
const companies: Company[] = ['Orion Santé Services','Baobab Logistique','Vahana Technologies','Mada Horizon Mining','Tropic Textile','Asteria Banque','Cobalt Énergies','Sakalava Transport','Nexus Assurance','Lemuria Agro'].map((name, i) => ({ id:id('company',i), name, paymentMode:'Crédit', settlementMode:i%2?'per_invoice':'monthly_global', createdAt:iso(730-i) }));
const users: User[] = [
 ['USR-ADMIN','Admin Démonstration','admin'],['USR-REC','Aina Rakoto','receptionist'],['USR-DOC','Dr. Feno Rasoana','doctor'],['USR-CASH','Miora Kanto','cashier'],['USR-PHA','Tiana Soa','pharmacy'],['USR-LAB','Hery Lanto','laboratory'],['USR-MAG','Niry Tahina','magasinier'],['USR-BIL','Lova Sitraka','billing'],
].map(([id,name,role])=>{
  const passwords: Record<string,string> = {
    'admin': 'admin123',
    'receptionist': 'rec123',
    'doctor': 'doc123',
    'cashier': 'caisse123',
    'pharmacy': 'pharma123',
    'laboratory': 'labo123',
    'magasinier': 'mag123',
    'billing': 'fact123'
  };
  return {id,name,role:role as User['role'],password:passwords[role]||'demo'};
});
const articleNames = ['Paracétamol 500 mg','Amoxicilline 500 mg','Ibuprofène 400 mg','Oméprazole 20 mg','Metformine 850 mg','Amlodipine 5 mg','Ceftriaxone 1 g','Sérum physiologique','Gants examen','Tube EDTA','Réactif glycémie','Bandelette urinaire','Gel échographie','Papier thermique','Composite dentaire','Anesthésique dentaire','Masque chirurgical','Compresses stériles','Solution antiseptique','Vitamine C 500 mg'];
const articles: Article[] = articleNames.map((name,i)=>({id:id('art',i),name,family:i<10||i>15?'MEDIC':i<13?'LABO':i<15?'ECHO':'DENT',unit:i===7?'poche':i===9?'unité':'boîte',barcode:`619${String(i).padStart(9,'0')}`,priceComptoir:500+(i+1)*550,priceSociete:450+(i+1)*480,priceExterne:650+(i+1)*620,purchasePrice:250+(i+1)*260,stockCentral:1000+i*79,stockPharmacie:180+i*13,minStockCentral:80,minStockPharmacie:30,supplier:`Fournisseur Synthèse ${i%12+1}`,expiryDate:'2027-12-31'}));
const labCatalog: LabExamCatalog[] = ['NFS','Glycémie à jeun','Créatinine','Bilan lipidique','CRP','ECBU','Goutte épaisse','TSH'].map((name,i)=>({id:id('exam',i),code:`LAB${String(i+1).padStart(3,'0')}`,name,category:i<2?'hematologie':'biochimie',parameters:[name],sampleType:'Sang veineux',priceComptoir:8000+i*1800,priceSociete:7000+i*1500,priceExterne:10000+i*2000,urgentPrice:13000+i*2500,durationHours:4}));

/** Construit une date ISO dans un mois donné (offset négatif depuis END) avec un jour précis. */
function isoMonthDay(monthOffset: number, day: number, hour: number): string {
  const d = new Date(END);
  d.setUTCMonth(d.getUTCMonth() - monthOffset);
  d.setUTCDate(Math.min(day, 28)); // sécurité: pas de jour > 28
  d.setUTCHours(hour, Math.floor(rnd() * 60), Math.floor(rnd() * 60), 0);
  return d.toISOString();
}

const VISITS_PER_MONTH = 3;
const MONTHS_OF_HISTORY = 12;
const PATIENT_COUNT = 50;

export function createMassiveDemoState(): AppState {
  seed = 0x51af1a;

  const patients: Patient[] = [];
  const consultations: Consultation[] = [];
  const invoices: Invoice[] = [];
  const ventes: Vente[] = [];
  const venteLines: VenteLine[] = [];
  const ventePayments: VentePayment[] = [];
  const labRequests: AppState['labRequests'] = [];
  const journey: AppState['journey'] = [];
  const deliveries: AppState['pharmaDeliveryItems'] = [];

  /* ── 50 patients ─────────────────────────────────────────────────────── */
  for (let n = 0; n < PATIENT_COUNT; n++) {
    const fn = first[n % first.length];
    const ln = `${last[Math.floor(n / first.length) % last.length]}-${String(n % first.length + 1).padStart(2, '0')}`;
    const company = n % 4 === 0 ? companies[n % companies.length] : undefined;
    const registered = isoMonthDay(MONTHS_OF_HISTORY + 1, 1 + n % 27, 8); // enregistrés avant les 12 mois

    const patient: Patient = {
      id: id('pat', n),
      dossier: `DOS-${String(100000 + n)}`,
      matricule: company ? `MAT-${company.id.slice(-2)}-${String(n).padStart(5, '0')}` : undefined,
      firstName: fn,
      lastName: ln,
      dateOfBirth: `${1945 + n % 61}-${String(1 + n % 12).padStart(2, '0')}-${String(1 + n % 27).padStart(2, '0')}`,
      age: `${20 + n % 65} Ans`,
      gender: n % 2 ? 'F' : 'M',
      address: `Lot ${1 + n % 250}, Quartier ${pick(['Ankorondrano', 'Ivandry', 'Ambanidia', 'Toamasina', 'Mahajanga', 'Antsirabe'])}`,
      contact: `03${2 + n % 7} ${String(10000000 + n).slice(0, 2)} ${String(10000000 + n).slice(2, 5)} ${String(10000000 + n).slice(5)}`,
      ssn: `SYN-${String(100000000 + n)}`,
      insureName: company?.name,
      clientType: company ? 'societe' : 'comptoir',
      company: company?.name,
      allergies: n % 9 === 0 ? ['Pénicilline'] : [],
      chronicTreatments: n % 8 === 0 ? ['Traitement synthétique'] : [],
      antecedents: n % 7 === 0 ? ['Antécédent déclaré'] : [],
      bloodGroup: pick(['A+', 'B+', 'O+', 'AB+']),
      registeredAt: registered,
      registeredBy: 'Aina Rakoto',
      status: 'completed',
      lastVisitAt: iso(0),
    };
    patients.push(patient);

    journey.push({
      id: id('journey', n),
      patientId: patient.id,
      timestamp: registered,
      department: 'reception',
      action: 'Enregistrement patient',
      status: 'registered',
      actorName: 'Aina Rakoto',
    });

    /* ── 3 visites par mois × 12 mois ────────────────────────────────── */
    for (let m = 0; m < MONTHS_OF_HISTORY; m++) {
      for (let v = 0; v < VISITS_PER_MONTH; v++) {
        // Jours répartis dans le mois : ~5, ~15, ~25 avec petite variation aléatoire
        const baseDay = 5 + v * 10;          // 5, 15, 25
        const dayOffset = Math.floor(rnd() * 3); // 0-2
        const hour = 7 + Math.floor(rnd() * 11); // 07h-17h
        const date = isoMonthDay(MONTHS_OF_HISTORY - 1 - m, baseDay + dayOffset, hour);

        const k = consultations.length;
        const cid = id('consult', k);
        const article = articles[(n + v + m) % articles.length];

        const consultation: Consultation = {
          id: cid,
          patientId: patient.id,
          doctorId: 'USR-DOC',
          doctorName: 'Dr. Feno Rasoana',
          date,
          vitalSigns: {
            temperature: '36.8',
            bloodPressureSystolic: '120',
            bloodPressureDiastolic: '80',
            heartRate: '76',
            oxygenSaturation: '98',
            weight: String(55 + (n % 30)),
            height: String(155 + (n % 25)),
          },
          visitReason: pick(['Contrôle médical', 'Douleur abdominale', 'Fièvre', 'Consultation de suivi', 'Bilan annuel']),
          diagnosis: pick(['Syndrome viral simple', 'Hypertension stabilisée', 'Suivi clinique', 'Infection bénigne']),
          notes: 'Donnée de démonstration synthétique.',
          prescriptions: [],
          labRequests: [],
          hospitalizeRequested: k % 97 === 0,
          surgeryRequested: k % 211 === 0,
          isEmergency: k % 23 === 0,
        };
        consultations.push(consultation);

        const iid = id('invoice', k);
        const amount = 8000 + (k % 9) * 3500;
        const paid = k % 7 !== 0;
        const invoice: Invoice = {
          id: iid,
          patientId: patient.id,
          consultationId: cid,
          clientName: `${ln} ${fn}`,
          clientType: patient.clientType,
          items: [
            { description: 'Consultation médicale', amount, category: 'consultation' },
            { description: article.name, amount: article.priceComptoir, category: 'pharmacy' },
          ],
          totalAmount: amount + article.priceComptoir,
          patientCharge: company ? 0 : amount + article.priceComptoir,
          status: paid ? 'paid' : 'pending',
          paidAt: paid ? date : undefined,
          paidBy: paid ? 'Miora Kanto' : undefined,
          createdAt: date,
          isExternal: false,
        };
        invoices.push(invoice);

        const vid = id('vente', k);
        const total = invoice.totalAmount;
        const vente: Vente = {
          id: vid,
          patientId: patient.id,
          consultationId: cid,
          numeroFacture: `FAC-${new Date(date).getUTCFullYear()}-${String(k + 1).padStart(6, '0')}`,
          type: 'consultation',
          clientType: patient.clientType,
          clientName: `${ln} ${fn}`,
          company: company?.name,
          subtotal: total,
          remiseMontant: 0,
          montantFacture: total,
          montantPaye: paid ? total : 0,
          status: paid ? 'paid' : 'pending',
          isExterne: false,
          source: 'caisse',
          dateVente: date,
          paidAt: paid ? date : undefined,
          createdAt: date,
        };
        ventes.push(vente);
        venteLines.push(
          { id: id('vline', k * 2), venteId: vid, articleName: 'Consultation médicale', quantity: 1, unitPrice: amount, discount: 0, category: 'consultation', dateSort: date },
          { id: id('vline', k * 2 + 1), venteId: vid, articleId: article.id, articleName: article.name, quantity: 1 + (k % 3), unitPrice: article.priceComptoir, discount: 0, category: 'pharmacy', dateSort: date },
        );
        if (paid) ventePayments.push({
          id: id('payment', k),
          venteId: vid,
          amount: total,
          method: pick(['Espèces', 'Mobile Money', 'Carte bancaire']),
          date,
          paidBy: 'Miora Kanto',
          paidByUserId: 'USR-CASH',
        });

        // Parcours patient
        journey.push({
          id: id('journey', 5000 + n * 100 + m * 3 + v),
          patientId: patient.id,
          timestamp: date,
          department: 'consultation',
          action: 'Consultation terminée',
          status: paid ? 'invoice_paid' : 'consulted_awaiting_payment',
          consultationId: cid,
          invoiceId: iid,
          actorName: 'Dr. Feno Rasoana',
        });

        // ~1/3 des visites ont une demande labo
        if (k % 3 === 0) {
          const exam = labCatalog[k % labCatalog.length];
          labRequests.push({
            id: id('labreq', k),
            patientId: patient.id,
            consultationId: cid,
            examType: exam.name,
            code: exam.code,
            category: exam.category,
            parameters: exam.parameters,
            urgent: k % 11 === 0,
            status: k % 4 === 0 ? 'completed' : 'pending',
            sampleType: exam.sampleType,
            requestedAt: date,
            requestedBy: 'USR-DOC',
            invoiceId: iid,
            price: exam.priceComptoir,
            results: k % 4 === 0 ? [{ parameter: exam.name, value: 1, unit: '', normalMin: 0, normalMax: 2, isAbnormal: false }] : undefined,
            completedAt: k % 4 === 0 ? date : undefined,
          });
        }

        // ~1/4 des visites ont une délivrance pharmacie
        if (k % 4 === 0) deliveries.push({
          id: id('delivery', k),
          consultationId: cid,
          patientId: patient.id,
          patientName: `${ln} ${fn}`,
          doctorName: 'Dr. Feno Rasoana',
          articleId: article.id,
          articleName: article.name,
          quantity: 1,
          unitPrice: article.priceComptoir,
          posology: '1 unité matin et soir',
          deliveredAt: date,
          deliveredByUserId: 'USR-PHA',
          deliveredByName: 'Tiana Soa',
        });
      }
    }
  }

  /* ── Stock (ajusté pour 50 patients mais suffisant) ────────────────────── */
  const stockEntries = Array.from({ length: 300 }, (_, n) => {
    const a = articles[n % articles.length];
    return {
      id: id('entry', n),
      articleId: a.id,
      articleName: a.name,
      quantity: 50 + n % 180,
      purchasePrice: a.purchasePrice,
      supplier: `Fournisseur Synthèse ${n % 12 + 1}`,
      invoiceRef: `BL-${2024 + n % 3}-${String(n).padStart(5, '0')}`,
      expiryDate: '2027-12-31',
      date: iso(Math.floor(rnd() * 365)),
      enteredBy: 'Niry Tahina',
      destination: 'central' as const,
    };
  });
  const stockTransfers = Array.from({ length: 300 }, (_, n) => {
    const a = articles[n % articles.length];
    return {
      id: id('transfer', n),
      articleId: a.id,
      articleName: a.name,
      quantity: 2 + n % 25,
      category: n % 2 ? 'approvisionnement' as const : 'hospitalisation' as const,
      targetServiceId: n % 2 ? 'svc-pharmacie' : 'svc-bloc',
      targetServiceName: n % 2 ? 'Pharmacie' : 'Bloc opératoire',
      status: 'transferred' as const,
      requestedBy: 'Tiana Soa',
      requestedAt: iso(Math.floor(rnd() * 365)),
      transferredBy: 'Niry Tahina',
      transferredAt: iso(Math.floor(rnd() * 365)),
    };
  });
  const movementHeaders = [
    ...stockEntries.map((e, n) => ({
      id: id('move', n), type: 'achat' as const, ref: e.invoiceRef, date: e.date,
      userId: 'USR-MAG', userName: 'Niry Tahina', toLocation: 'central', totalQuantity: e.quantity, status: 'completed' as const,
    })),
    ...stockTransfers.map((t, n) => ({
      id: id('move-transfer', n), type: 'transfert' as const, ref: `TR-${n}`, date: t.transferredAt!,
      userId: 'USR-MAG', userName: 'Niry Tahina', fromLocation: 'central', toLocation: t.targetServiceId!, totalQuantity: t.quantity, status: 'completed' as const,
    })),
    ...stockTransfers.map((t, n) => ({
      id: id('move-exit', n), type: 'sortie' as const, ref: `SORT-${n}`, date: iso((n * 13) % 365),
      userId: 'USR-PHA', userName: 'Tiana Soa', fromLocation: 'pharmacie', totalQuantity: t.quantity, status: 'completed' as const,
    })),
  ];
  const movementLines = [
    ...stockEntries.map((e, n) => ({
      id: id('moveline', n), movementId: id('move', n), articleId: e.articleId, articleName: e.articleName, quantity: e.quantity, purchasePrice: e.purchasePrice,
    })),
    ...stockTransfers.flatMap((t, n) => [
      { id: id('moveline-transfer', n), movementId: id('move-transfer', n), articleId: t.articleId, articleName: t.articleName, quantity: t.quantity },
      { id: id('moveline-exit', n), movementId: id('move-exit', n), articleId: t.articleId, articleName: t.articleName, quantity: t.quantity, reason: 'Délivrance synthétique' },
    ]),
  ];
  const stockMovements = [
    ...stockEntries.map((e, n) => ({
      id: id('stockmove-entry', n), type: 'entry' as const, articleId: e.articleId, articleName: e.articleName, quantity: e.quantity,
      fromLocation: 'supplier', toLocation: 'central', ref: e.invoiceRef, date: e.date, userId: 'USR-MAG', userName: 'Niry Tahina',
    })),
    ...stockTransfers.map((t, n) => ({
      id: id('stockmove-transfer', n), type: 'transfer' as const, articleId: t.articleId, articleName: t.articleName, quantity: t.quantity,
      fromLocation: 'central', toLocation: t.targetServiceId!, ref: `TR-${n}`, date: t.transferredAt!, userId: 'USR-MAG', userName: 'Niry Tahina',
    })),
    ...stockTransfers.map((t, n) => ({
      id: id('stockmove-exit', n), type: 'exit' as const, articleId: t.articleId, articleName: t.articleName, quantity: t.quantity,
      fromLocation: 'pharmacie', toLocation: 'patient', ref: `SORT-${n}`, date: iso((n * 13) % 365), userId: 'USR-PHA', userName: 'Tiana Soa',
    })),
  ];

  /* ── Comptes de facturation société (12 mois) ────────────────────────── */
  const billingMonths = [...Array(12)].map((_, i) => {
    const d = new Date(END);
    d.setUTCMonth(d.getUTCMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const companyBillingAccounts = companies.filter(c => c.settlementMode === 'monthly_global').flatMap((c, ci) =>
    billingMonths.map((month, mi) => {
      const ids = invoices.filter(x => x.clientType === 'societe' && patients.find(p => p.id === x.patientId)?.company === c.name && x.createdAt.slice(0, 7) === month).map(x => x.id);
      const total = ids.reduce((s, x) => s + (invoices.find(i => i.id === x)?.totalAmount || 0), 0);
      return total ? {
        id: `statement-${ci}-${month}`, company: c.name, month, invoiceIds: ids, totalAmount: total,
        paidAmount: mi > 4 ? total : 0, status: (mi > 4 ? 'paid' : 'open') as 'paid' | 'open',
        createdAt: `${month}-01T08:00:00.000Z`,
        payments: mi > 4 ? [{ id: `statement-payment-${ci}-${month}`, amount: total, date: `${month}-25T10:00:00.000Z`, method: 'Virement', reference: `VIR-${month}` }] : [],
      } : null;
    }).filter(Boolean)
  ) as AppState['companyBillingAccounts'];

  /* ── Dossiers hospitalisation / bloc (quelques-uns parmi les 50) ──── */
  const hbRecords = patients.filter((_, n) => n % 10 === 0).map((p, n) => ({
    id: id('hb', n),
    patientId: p.id,
    patientName: `${p.lastName} ${p.firstName}`,
    clientType: p.clientType,
    company: p.company,
    type: n % 2 ? 'hospit' as const : 'bloc' as const,
    lines: [{ id: id('hbline', n), articleName: n % 2 ? 'Séjour hospitalier' : 'Acte bloc', quantity: 1, unitPrice: 50000, discount: 0, dateSort: iso(n * 10) }],
    payments: [],
    openedAt: iso(n * 10),
    openedBy: 'Miora Kanto',
  }));

  /* ── Assemblage final ─────────────────────────────────────────────── */
  return {
    currentUser: null,
    ticketSettings: {
      facilityName: 'SALFA — Démonstration',
      address: 'Antananarivo, Madagascar',
      phone: '',
      nif: '',
      logoUrl: '',
      receiptTitle: 'REÇU DE PAIEMENT',
      footerMessage: 'Jeu de données fictif.',
      paperWidth: 80,
      autoPrint: true,
      showLogo: true,
      showBarcode: true,
      showSignature: true,
      copies: 1,
      currency: 'Ar',
      paymentMethods: ['Espèces', 'Carte bancaire', 'Mobile Money', 'Virement', 'Chèque'],
      invoicePrefix: 'FAC',
    },
    patients,
    consultations,
    invoices,
    cashClosings: [],
    articles,
    stockTransfers,
    stockEntries,
    auditLogs: [],
    notifications: Array.from({ length: 30 }, (_, n) => ({
      id: id('notification', n),
      targetRole: pick(['billing', 'pharmacy', 'laboratory'] as const),
      message: `Notification de démonstration ${n + 1}`,
      type: 'info' as const,
      timestamp: iso(n % 365),
      read: n % 3 === 0,
    })),
    messages: Array.from({ length: 60 }, (_, n) => ({
      id: id('message', n),
      fromUserId: 'USR-REC',
      fromUserName: 'Aina Rakoto',
      toUserId: 'USR-DOC',
      toUserName: 'Dr. Feno Rasoana',
      content: `Message de coordination fictif n°${n + 1}.`,
      timestamp: iso(n % 365),
      read: n % 2 === 0,
    })),
    users,
    companies,
    companyBillingAccounts,
    fournisseurs: Array.from({ length: 12 }, (_, n) => ({
      id: id('supplier', n),
      name: `Fournisseur Synthèse ${n + 1}`,
      contactPerson: `Contact Fictif ${n + 1}`,
      phone: `032 ${String(1000000 + n).padStart(7, '0')}`,
      address: `Zone commerciale ${n + 1}`,
      createdAt: iso(730 - n),
    })),
    familles: ['MEDIC', 'LABO', 'DENT', 'ECHO'].map((x, n) => ({ id: id('family', n), code: x, name: x, color: 'blue', order: n })),
    journey,
    labRequests,
    labCatalog,
    warehouseServices: [
      { id: 'svc-pharmacie', code: 'PHA', name: 'Pharmacie', kind: 'pharmacie', color: 'purple', active: true, createdAt: iso(730) },
      { id: 'svc-bloc', code: 'BLOC', name: 'Bloc opératoire', kind: 'service', color: 'blue', active: true, createdAt: iso(730) },
    ],
    stockMovements,
    inventorySessions: [],
    movementHeaders,
    movementLines,
    pharmaDeliveryItems: deliveries,
    pharmaDeliveryClosings: [],
    pharmaClosingCounter: 0,
    hbRecords,
    ventes,
    venteLines,
    ventePayments,
    factureCounter: ventes.length,
  };
}
