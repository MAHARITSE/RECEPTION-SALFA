import * as XLSX from 'xlsx';

/**
 * Génère et télécharge le modèle Excel pour l'importation des Prestations (Factures SALFA)
 */
export function downloadPrestationsExcelTemplate() {
  const sampleData = [
    {
      'Numero_Facture': 'FACT-SALFA-2024-001',
      'Date_Soins': '2024-10-15',
      'Nom_Agent': 'RABE Jean (CONSERVATION INTERNATIONALE)',
      'Matricule': 'MCI-0452',
      'Societe': 'MCI CARE',
      'Sous_Societe': 'CONSERVATION INTERNATIONALE',
      'Acte_Medicale_Prix': 'CONS : 40 000; PHAR : 65 000; LABO : 25 000',
      'Montant_Total_Brut': 130000,
      'Ticket_Moderateur': 0,
      'Prise_En_Charge_Net': 130000,
      'Observations': 'Facture mensuelle soins ambulatoires',
    },
    {
      'Numero_Facture': 'FACT-SALFA-2024-002',
      'Date_Soins': '2024-10-16',
      'Nom_Agent': 'RASOA Marie (CONSERVATION INTERNATIONALE)',
      'Matricule': 'MCI-0118',
      'Societe': 'MCI CARE',
      'Sous_Societe': 'CONSERVATION INTERNATIONALE',
      'Acte_Medicale_Prix': 'CONS : 40 000; ECHOG : 80 000',
      'Montant_Total_Brut': 120000,
      'Ticket_Moderateur': 0,
      'Prise_En_Charge_Net': 120000,
      'Observations': 'Suivi médical périodique',
    },
    {
      'Numero_Facture': 'FACT-SALFA-2024-003',
      'Date_Soins': '2024-10-18',
      'Nom_Agent': 'ANDRY Patrick (CONSERVATION INTERNATIONALE)',
      'Matricule': 'MCI-0882',
      'Societe': 'MCI CARE',
      'Sous_Societe': 'CONSERVATION INTERNATIONALE',
      'Acte_Medicale_Prix': 'CONS : 40 000; DENT : 95 000',
      'Montant_Total_Brut': 135000,
      'Ticket_Moderateur': 0,
      'Prise_En_Charge_Net': 135000,
      'Observations': 'Soins dentaires urgents',
    },
  ];

  const guideData = [
    {
      'Colonne': 'Numero_Facture',
      'Obligatoire': 'Oui',
      'Description': 'Numéro unique de la facture ou du bon de prescription émis par SALFA',
      'Exemple': 'FACT-SALFA-2024-001'
    },
    {
      'Colonne': 'Date_Soins',
      'Obligatoire': 'Oui',
      'Description': 'Date de réalisation des soins (Format : AAAA-MM-JJ ou JJ/MM/AAAA)',
      'Exemple': '2024-10-15'
    },
    {
      'Colonne': 'Nom_Agent',
      'Obligatoire': 'Oui',
      'Description': 'Nom et prénom de l\'agent/assuré. La sous-société entre parenthèses est détectée automatiquement',
      'Exemple': 'RABE Jean (CONSERVATION INTERNATIONALE)'
    },
    {
      'Colonne': 'Matricule',
      'Obligatoire': 'Recommandé',
      'Description': 'Identifiant ou matricule de l\'assuré dans son entreprise',
      'Exemple': 'MCI-0452'
    },
    {
      'Colonne': 'Societe',
      'Obligatoire': 'Oui',
      'Description': 'Nom de la société / assurance principale (MCI CARE)',
      'Exemple': 'MCI CARE'
    },
    {
      'Colonne': 'Sous_Societe',
      'Obligatoire': 'Non',
      'Description': 'Sous-société, filiale ou entité figurant entre parenthèses',
      'Exemple': 'CONSERVATION INTERNATIONALE'
    },
    {
      'Colonne': 'Acte_Medicale_Prix',
      'Obligatoire': 'Oui',
      'Description': 'Liste des actes et montants séparés par point-virgule (Ex: CONS : 40 000; PHAR : 65 000)',
      'Exemple': 'CONS : 40 000; PHAR : 65 000'
    },
    {
      'Colonne': 'Montant_Total_Brut',
      'Obligatoire': 'Oui',
      'Description': 'Montant total brut des soins facturés (en Ariary)',
      'Exemple': '130000'
    },
    {
      'Colonne': 'Ticket_Moderateur',
      'Obligatoire': 'Oui',
      'Description': 'Part restant à la charge de l\'assuré ou de l\'employeur (Ticket modérateur)',
      'Exemple': '26000'
    },
    {
      'Colonne': 'Prise_En_Charge_Net',
      'Obligatoire': 'Oui',
      'Description': 'Montant net réclamé à l\'assurance (Montant Brut - Ticket Modérateur)',
      'Exemple': '104000'
    },
    {
      'Colonne': 'Observations',
      'Obligatoire': 'Non',
      'Description': 'Remarques ou détails complémentaires',
      'Exemple': 'Soins ambulatoires'
    }
  ];

  const workbook = XLSX.utils.book_new();

  const wsSample = XLSX.utils.json_to_sheet(sampleData);
  // Adjust column widths
  wsSample['!cols'] = [
    { wch: 22 }, // Numero_Facture
    { wch: 14 }, // Date_Soins
    { wch: 30 }, // Nom_Agent
    { wch: 16 }, // Matricule
    { wch: 16 }, // Societe
    { wch: 20 }, // Sous_Societe
    { wch: 45 }, // Acte_Medicale_Prix
    { wch: 18 }, // Montant_Total_Brut
    { wch: 18 }, // Ticket_Moderateur
    { wch: 20 }, // Prise_En_Charge_Net
    { wch: 35 }, // Observations
  ];
  XLSX.utils.book_append_sheet(workbook, wsSample, 'Modele_Prestations');

  const wsGuide = XLSX.utils.json_to_sheet(guideData);
  wsGuide['!cols'] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 65 },
    { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(workbook, wsGuide, 'Guide_Remplissage');

  XLSX.writeFile(workbook, 'Modele_Import_Prestations_Facture_SALFA.xlsx');
}

/**
 * Génère et télécharge le modèle Excel pour l'importation des Règlements / Décomptes d'assurance (ASCOMA, MCI, BSA)
 */
export function downloadDecomptesExcelTemplate() {
  const sampleData = [
    {
      'Ref_Decompte': 'DEC-ASCOMA-2024-10',
      'Date_Reglement': '2024-11-20',
      'Date_Soins': '2024-10-15',
      'Nom_Agent': 'RABE Jean',
      'Matricule': 'BSA-0452',
      'Numero_Facture_Prescription': 'FACT-SALFA-2024-001',
      'Code_Acte': 'CONS',
      'Libelle_Acte': 'Consultation Médecine Générale',
      'Montant_Reclame_Brut': 40000,
      'Ticket_Moderateur': 8000,
      'Montant_Paye_Regle': 32000,
      'Montant_Exclu_Rejet': 0,
      'Motif_Observation': 'Prise en charge à 80%',
    },
    {
      'Ref_Decompte': 'DEC-ASCOMA-2024-10',
      'Date_Reglement': '2024-11-20',
      'Date_Soins': '2024-10-15',
      'Nom_Agent': 'RABE Jean',
      'Matricule': 'BSA-0452',
      'Numero_Facture_Prescription': 'FACT-SALFA-2024-001',
      'Code_Acte': 'PHAR',
      'Libelle_Acte': 'Produits Pharmaceutiques',
      'Montant_Reclame_Brut': 65000,
      'Ticket_Moderateur': 13000,
      'Montant_Paye_Regle': 52000,
      'Montant_Exclu_Rejet': 0,
      'Motif_Observation': 'Règlement accordé',
    },
    {
      'Ref_Decompte': 'DEC-MCI-2024-11',
      'Date_Reglement': '2024-11-22',
      'Date_Soins': '2024-10-18',
      'Nom_Agent': 'ANDRY Patrick',
      'Matricule': 'MCI-0882',
      'Numero_Facture_Prescription': 'FACT-SALFA-2024-003',
      'Code_Acte': 'DENT',
      'Libelle_Acte': 'Soins Dentaires',
      'Montant_Reclame_Brut': 95000,
      'Ticket_Moderateur': 19000,
      'Montant_Paye_Regle': 76000,
      'Montant_Exclu_Rejet': 0,
      'Motif_Observation': 'Règlement intégral',
    },
  ];

  const guideData = [
    {
      'Colonne': 'Ref_Decompte',
      'Obligatoire': 'Oui',
      'Description': 'Référence du bordereau de règlement ou décompte bancaire / assureur',
      'Exemple': 'DEC-ASCOMA-2024-10'
    },
    {
      'Colonne': 'Date_Reglement',
      'Obligatoire': 'Oui',
      'Description': 'Date de virement ou paiement émis par l\'assureur (AAAA-MM-JJ)',
      'Exemple': '2024-11-20'
    },
    {
      'Colonne': 'Date_Soins',
      'Obligatoire': 'Recommandé',
      'Description': 'Date de prescription ou soins d\'origine',
      'Exemple': '2024-10-15'
    },
    {
      'Colonne': 'Nom_Agent',
      'Obligatoire': 'Oui',
      'Description': 'Nom du patient soigné (aligné à la date du soin) ou de l\'assuré. Pour BSA, le nom aligné à la date du soin est prioritaire.',
      'Exemple': 'RABE Jean'
    },
    {
      'Colonne': 'Matricule',
      'Obligatoire': 'Recommandé',
      'Description': 'Matricule de l\'assuré pour matching automatique précis',
      'Exemple': 'BSA-0452'
    },
    {
      'Colonne': 'Numero_Facture_Prescription',
      'Obligatoire': 'Recommandé',
      'Description': 'N° Facture SALFA de la prescription rattachée (ex: FACT-SALFA-2024-001)',
      'Exemple': 'FACT-SALFA-2024-001'
    },
    {
      'Colonne': 'Code_Acte',
      'Obligatoire': 'Oui',
      'Description': 'Code de l\'acte payé (ex: CONS, PHAR, LABO, RADIO, DENT, ECHOG)',
      'Exemple': 'CONS'
    },
    {
      'Colonne': 'Libelle_Acte',
      'Obligatoire': 'Non',
      'Description': 'Description détaillée de l\'acte réglé',
      'Exemple': 'Consultation Médecine Générale'
    },
    {
      'Colonne': 'Montant_Reclame_Brut',
      'Obligatoire': 'Oui',
      'Description': 'Montant réclamé sur l\'acte',
      'Exemple': '40000'
    },
    {
      'Colonne': 'Ticket_Moderateur',
      'Obligatoire': 'Non',
      'Description': 'Part déduite au titre du ticket modérateur',
      'Exemple': '8000'
    },
    {
      'Colonne': 'Montant_Paye_Regle',
      'Obligatoire': 'Oui',
      'Description': 'Somme effectivement payée/versée par l\'assurance pour cet acte',
      'Exemple': '32000'
    },
    {
      'Colonne': 'Montant_Exclu_Rejet',
      'Obligatoire': 'Non',
      'Description': 'Montant rejeté ou non pris en charge',
      'Exemple': '0'
    },
    {
      'Colonne': 'Motif_Observation',
      'Obligatoire': 'Non',
      'Description': 'Motif de prise en charge ou de rejet',
      'Exemple': 'Prise en charge 80%'
    }
  ];

  const workbook = XLSX.utils.book_new();

  const wsSample = XLSX.utils.json_to_sheet(sampleData);
  wsSample['!cols'] = [
    { wch: 22 }, // Ref_Decompte
    { wch: 14 }, // Date_Reglement
    { wch: 14 }, // Date_Soins
    { wch: 26 }, // Nom_Agent
    { wch: 16 }, // Matricule
    { wch: 28 }, // Numero_Facture_Prescription
    { wch: 14 }, // Code_Acte
    { wch: 32 }, // Libelle_Acte
    { wch: 20 }, // Montant_Reclame_Brut
    { wch: 18 }, // Ticket_Moderateur
    { wch: 20 }, // Montant_Paye_Regle
    { wch: 18 }, // Montant_Exclu_Rejet
    { wch: 32 }, // Motif_Observation
  ];
  XLSX.utils.book_append_sheet(workbook, wsSample, 'Modele_Reglements');

  const wsGuide = XLSX.utils.json_to_sheet(guideData);
  wsGuide['!cols'] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 70 },
    { wch: 30 }
  ];
  XLSX.utils.book_append_sheet(workbook, wsGuide, 'Guide_Rattachement');

  XLSX.writeFile(workbook, 'Modele_Import_Reglements_Decompte_Assurance.xlsx');
}
