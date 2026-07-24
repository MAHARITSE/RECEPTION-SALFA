-- ============================================================
-- RECEPTION SALFA - Données initiales
-- Base: reception_salfa
-- ============================================================

USE reception_salfa;

-- ============================================================
-- Utilisateurs par défaut
-- Mot de passe: admin123 (à changer en production!)
-- ============================================================

INSERT INTO utilisateurs (username, password_hash, nom_complet, role, service, telephone, email, statut) VALUES
-- Administrateur
('admin', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Administrateur Système', 'admin', 'Informatique', '+243XXXXXXXXX', 'admin@hopital.local', 'actif'),

-- Réception
('reception1', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Jean Mukamba', 'receptionniste', 'Réception', '+243XXXXXXXX1', 'reception1@hopital.local', 'actif'),
('reception2', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Marie Kabongo', 'receptionniste', 'Réception', '+243XXXXXXXX2', 'reception2@hopital.local', 'actif'),

-- Médecins
('dr_kalala', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Dr. Patient Kalala', 'medecin', 'Médecine générale', '+243XXXXXXXX3', 'dr.kalala@hopital.local', 'actif'),
('dr_muteba', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Dr. Marie Muteba', 'medecin', 'Pédiatrie', '+243XXXXXXXX4', 'dr.muteba@hopital.local', 'actif'),

-- Pharmacie
('pharmacien1', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Pierre Ngalula', 'pharmacien', 'Pharmacie', '+243XXXXXXXX5', 'pharmacie@hopital.local', 'actif'),

-- Laboratoire
('laborantin1', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Annie Mwamba', 'laborantin', 'Laboratoire', '+243XXXXXXXX6', 'labo@hopital.local', 'actif'),

-- Magasinier
('magasinier1', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Jean-Pierre Tshilombo', 'magasinier', 'Magasin', '+243XXXXXXXX7', 'magasin@hopital.local', 'actif'),

-- Caisse
('caisse1', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Grace Kayumba', 'caisse', 'Caisse', '+243XXXXXXXX8', 'caisse@hopital.local', 'actif'),

-- Infirmiers
('infirmier1', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Patrick Kabongo', 'infirmier', 'Hospitalisation', '+243XXXXXXXX9', 'infirmier1@hopital.local', 'actif');

-- ============================================================
-- Médicaments de base
-- ============================================================

INSERT INTO medicaments (code, nom_commercial, nom_generique, forme, dosage, prix_unitaire, stock_actuel, stock_minimum, emplacement, fournisseur) VALUES
-- Analgésiques
('MED001', 'Doliprane 500mg', 'Paracétamol', 'Comprimé', '500mg', 0.50, 500, 50, 'A1-01', 'Pharmacie Centrale'),
('MED002', 'Spasfon 80mg', 'Phloroglucinol', 'Comprimé', '80mg', 1.20, 200, 30, 'A1-02', 'Pharmacie Centrale'),
('MED003', 'Brufen 400mg', 'Ibuprofène', 'Comprimé', '400mg', 0.80, 300, 40, 'A1-03', 'Pharmacie Centrale'),

-- Antibiotiques
('MED004', 'Amoxicilline 500mg', 'Amoxicilline', 'Gélule', '500mg', 1.50, 400, 50, 'B2-01', 'Pharmacie Centrale'),
('MED005', 'Azithromycine 250mg', 'Azithromycine', 'Comprimé', '250mg', 3.00, 150, 20, 'B2-02', 'Pharmacie Centrale'),
('MED006', 'Ciprox 500mg', 'Ciprofloxacine', 'Comprimé', '500mg', 2.00, 200, 30, 'B2-03', 'Pharmacie Centrale'),

-- Anti-inflammatoires
('MED007', 'Voltarène 50mg', 'Diclofénac', 'Comprimé', '50mg', 1.00, 250, 40, 'C1-01', 'Pharmacie Centrale'),
('MED008', 'Prednisolone 20mg', 'Prednisolone', 'Comprimé', '20mg', 0.70, 180, 30, 'C1-02', 'Pharmacie Centrale'),

-- Anti-hypertenseurs
('MED009', 'Amlor 5mg', 'Amlodipine', 'Comprimé', '5mg', 2.50, 100, 20, 'D1-01', 'Pharmacie Centrale'),
('MED010', 'Lasix 40mg', 'Furosémide', 'Comprimé', '40mg', 1.80, 120, 25, 'D1-02', 'Pharmacie Centrale'),

-- Anti-diabétiques
('MED011', 'Metformine 500mg', 'Metformine', 'Comprimé', '500mg', 0.60, 200, 30, 'E1-01', 'Pharmacie Centrale'),
('MED012', 'Glibenclamide 5mg', 'Glibenclamide', 'Comprimé', '5mg', 0.90, 150, 25, 'E1-02', 'Pharmacie Centrale'),

-- Vitamines et suppléments
('MED013', 'Multivitamines', 'Complexe vitaminique', 'Comprimé', '-', 1.00, 300, 50, 'F1-01', 'Pharmacie Centrale'),
('MED014', 'Ferograd 500mg', 'Sulfate ferreux', 'Comprimé', '500mg', 1.20, 200, 30, 'F1-02', 'Pharmacie Centrale'),

-- Solution injectable
('MED015', 'Serum physiologique 100ml', 'NaCl 0.9%', 'Solution injectable', '100ml', 2.00, 100, 20, 'R1-01', 'Pharmacie Centrale'),
('MED016', 'Glucose 5% 250ml', 'Glucose', 'Solution injectable', '250ml', 2.50, 80, 15, 'R1-02', 'Pharmacie Centrale');

-- ============================================================
-- Sociétés (Assurances/Corporatifs)
-- ============================================================

INSERT INTO societes (nom, adresse, telephone, numero_contrat, taux_remboursement, plafond_annuel, date_debut_contrat, date_fin_contrat, statut) VALUES
('INSS - Institut National de Sécurité Sociale', 'Kinshasa, Gombe', '+243XXXXXXXXX', 'INSS-2024-001', 80.00, 5000.00, '2024-01-01', '2024-12-31', 'actif'),
('SONAS', 'Kinshasa, Commune de la Gombe', '+243XXXXXXXXX', 'SONAS-2024-001', 70.00, 3000.00, '2024-01-01', '2024-12-31', 'actif'),
('Rawbank Assurance', 'Kinshasa, Centre Ville', '+243XXXXXXXXX', 'RAWBANK-2024-001', 90.00, 10000.00, '2024-01-01', '2024-12-31', 'actif'),
('TMB - Trust Merchant Bank', 'Kinshasa, Business Center', '+243XXXXXXXXX', 'TMB-2024-001', 75.00, 5000.00, '2024-01-01', '2024-12-31', 'actif'),
('Entreprise Minière Gécamines', 'Likasi, Zone industrielle', '+243XXXXXXXXX', 'GECAMINES-2024-001', 85.00, 8000.00, '2024-01-01', '2024-12-31', 'actif');

-- ============================================================
-- Patients de démonstration
-- ============================================================

INSERT INTO patients (numero_dossier, nom, post_nom, pre_nom, date_naissance, sexe, etat_civil, adresse, telephone, personne_contact, telephone_urgence, groupe_sanguin, allergies, antecedents_medicaux, statut) VALUES
('PAT-2024-0001', 'Kabongo', 'Mwenze', 'Patrick', '1985-03-15', 'M', 'Marié', 'Kinshasa, Commune de Limete', '+243XXXXXXXX01', 'Marie Kabongo', '+243XXXXXXXX02', 'O+', 'Pénicilline', 'Hypertension artérielle', 'actif'),
('PAT-2024-0002', 'Mwamba', 'Nkulu', 'Annie', '1990-07-22', 'F', 'Célibataire', 'Kinshasa, Commune de Matete', '+243XXXXXXXX03', 'Jean Mwamba', '+243XXXXXXXX04', 'A+', 'Aucune', 'Aucune', 'actif'),
('PAT-2024-0003', 'Tshilombo', 'Kalala', 'Grace', '1978-11-08', 'F', 'Marié', 'Kinshasa, Commune de Gombe', '+243XXXXXXXX05', 'Pierre Tshilombo', '+243XXXXXXXX06', 'B+', 'Aspirine', 'Diabète type 2', 'actif'),
('PAT-2024-0004', 'Ngalula', 'Kabongo', 'Jean-Pierre', '1995-01-30', 'M', 'Célibataire', 'Kinshasa, Commune de Kikesi', '+243XXXXXXXX07', 'Marie Ngalula', '+243XXXXXXXX08', 'AB+', 'Aucune', 'Aucune', 'actif'),
('PAT-2024-0005', 'Muteba', 'Kayumba', 'Fabienne', '2015-05-12', 'F', 'Célibataire', 'Kinshasa, Commune de Mont-Ngafula', '+243XXXXXXXX09', 'Dr. Marie Muteba', '+243XXXXXXXX10', 'O-', 'Aucune', 'Asthme léger', 'actif');

-- ============================================================
-- Consultations de démonstration
-- ============================================================

INSERT INTO consultations (patient_id, medecin_id, numero_consultation, motif_consultation, diagnostique, traitement, notes, statut, date_consultation) VALUES
(1, 4, 'CONS-2024-0001', 'Douleur abdominale persistante depuis 3 jours', 'Gastrite aiguë', 'Traitement anti-acide pendant 7 jours', 'Patient revenir si pas d\'amélioration dans 48h', 'terminee', '2024-07-20 09:30:00'),
(2, 4, 'CONS-2024-0002', 'Contrôle tension artérielle', 'Tension normale', 'Continuer le traitement en cours', 'Bon état général', 'terminee', '2024-07-21 10:00:00'),
(3, 5, 'CONS-2024-0003', 'Fièvre et toux depuis une semaine', 'Infection respiratoire haute', 'Antibiotique et antipyrétique', 'Rv dans 5 jours pour contrôle', 'en_cours', '2024-07-22 08:45:00');

-- ============================================================
-- Examens demandés
-- ============================================================

INSERT INTO examens (consultation_id, patient_id, type_examen, description, prix, statut, date_examen) VALUES
(1, 1, 'Analyse sanguine', 'NFS + VS + CRP', 25.00, 'termine', '2024-07-20 10:00:00'),
(1, 1, 'Échographie abdominale', 'Échographie de l\'abdomen', 50.00, 'termine', '2024-07-20 11:00:00'),
(3, 3, 'Radiographie thoracique', 'Radio poumon de face', 30.00, 'en_cours', '2024-07-22 09:30:00');

-- ============================================================
-- Prescriptions
-- ============================================================

INSERT INTO prescriptions (consultation_id, medicament_id, posologie, duree_jours, quantite, instructions, statut) VALUES
(1, 1, '1 comprimé 3 fois par jour', 7, 21, 'À prendre pendant les repas', 'delivre'),
(1, 2, '1 comprimé en cas de douleur', 7, 14, 'En cas de besoin', 'delivre'),
(3, 4, '1 gélule 3 fois par jour', 5, 15, 'À prendre avant les repas', 'en_attente'),
(3, 1, '1 comprimé 3 fois par jour', 5, 15, 'En cas de fièvre > 38°C', 'en_attente');

-- ============================================================
-- Factures
-- ============================================================

INSERT INTO factures (patient_id, consultation_id, numero_facture, type_paiement, montant_total, montant_paye, statut, societe_id, date_facture) VALUES
(1, 1, 'FAC-2024-0001', 'cash', 150.00, 150.00, 'paye', NULL, '2024-07-20 11:30:00'),
(2, 2, 'FAC-2024-0002', 'assurance', 80.00, 64.00, 'paye', 1, '2024-07-21 10:30:00'),
(3, 3, 'FAC-2024-0003', 'corporatif', 250.00, 0.00, 'en_attente', 3, '2024-07-22 09:00:00');

-- ============================================================
-- Détails des factures
-- ============================================================

INSERT INTO details_facture (facture_id, description, quantite, prix_unitaire, sous_total) VALUES
(1, 'Consultation médicale', 1, 25.00, 25.00),
(1, 'Échographie abdominale', 1, 50.00, 50.00),
(1, 'Analyse sanguine (NFS+VS+CRP)', 1, 25.00, 25.00),
(1, 'Médicaments prescrits', 1, 50.00, 50.00),
(2, 'Consultation contrôle', 1, 20.00, 20.00),
(2, 'Mesure tension artérielle', 1, 10.00, 10.00),
(2, 'Médicaments prescrits', 1, 50.00, 50.00),
(3, 'Consultation médicale', 1, 30.00, 30.00),
(3, 'Radiographie thoracique', 1, 30.00, 30.00),
(3, 'Médicaments prescription', 1, 40.00, 40.00),
(3, 'Frais de dossier', 1, 10.00, 10.00);

-- ============================================================
-- Messages
-- ============================================================

INSERT INTO messages (expediteur_id, destinataire_id, sujet, contenu, lu, date_envoi) VALUES
(1, 4, 'Bienvenue Dr. Kalala', 'Bienvenue dans le système RECEPTION SALFA. N\'oubliez pas de changer votre mot de passe.', TRUE, '2024-07-15 08:00:00'),
(1, 2, 'Formation utilisateurs', 'Une formation sur l\'utilisation du système est prévue pour le 25/07/2024 à 9h.', TRUE, '2024-07-18 14:00:00'),
(4, 6, 'Stock bas - Paracétamol', 'Le stock de Doliprane est bientôt épuisé. Merci de commander.', FALSE, '2024-07-22 07:30:00');

-- ============================================================
-- Demandes d'achat
-- ============================================================

INSERT INTO demande_achats (demandeur_id, numero_demande, service, description, justification, quantite_demandee, montant_estime, statut, date_soumission) VALUES
(6, 'DA-2024-0001', 'Pharmacie', 'Réapprovisionnement antibiotiques', 'Stock actuel insuffisant pour couvrir les 2 prochaines semaines', 200, 600.00, 'soumise', '2024-07-22 08:00:00'),
(7, 'DA-2024-0002', 'Laboratoire', 'Réactifs pour analyses sanguines', 'Réactifs périmés le 31/07/2024', 50, 450.00, 'soumise', '2024-07-21 16:00:00');

-- ============================================================
-- FIN DES DONNÉES DE DÉMONSTRATION
-- ============================================================
