-- ============================================================
-- RECEPTION SALFA - Structure de la base de données
-- Base: reception_salfa
-- ============================================================

-- Supprimer la base si elle existe (décommenter pour réinitialiser)
-- DROP DATABASE IF EXISTS reception_salfa;

-- Créer la base de données
CREATE DATABASE IF NOT EXISTS reception_salfa
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE reception_salfa;

-- ============================================================
-- Table: patients
-- ============================================================
CREATE TABLE IF NOT EXISTS patients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    numero_dossier VARCHAR(50) UNIQUE NOT NULL,
    nom VARCHAR(100) NOT NULL,
    post_nom VARCHAR(100),
    pre_nom VARCHAR(100),
    date_naissance DATE,
    sexe ENUM('M', 'F') NOT NULL,
    etat_civil ENUM('Célibataire', 'Marié(e)', 'Divorcé(e)', 'Veuf/Veuve') DEFAULT 'Célibataire',
    adresse TEXT,
    telephone VARCHAR(20),
    email VARCHAR(100),
    personne_contact VARCHAR(100),
    telephone_urgence VARCHAR(20),
    groupe_sanguin ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
    allergies TEXT,
    antecedents_medicaux TEXT,
    date_premiere_visite DATETIME DEFAULT CURRENT_TIMESTAMP,
    statut ENUM('actif', 'inactif', 'décédé') DEFAULT 'actif',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: utilisateurs
-- ============================================================
CREATE TABLE IF NOT EXISTS utilisateurs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nom_complet VARCHAR(150) NOT NULL,
    role ENUM('admin', 'medecin', 'infirmier', 'pharmacien', 'receptionniste', 'magasinier', 'laborantin', 'caisse') NOT NULL,
    service VARCHAR(100),
    telephone VARCHAR(20),
    email VARCHAR(100),
    statut ENUM('actif', 'inactif') DEFAULT 'actif',
    date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
    derniere_connexion DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: consultations
-- ============================================================
CREATE TABLE IF NOT EXISTS consultations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    medecin_id INT NOT NULL,
    numero_consultation VARCHAR(50) UNIQUE NOT NULL,
    motif_consultation TEXT NOT NULL,
    diagnostique TEXT,
    traitement TEXT,
    notes TEXT,
    statut ENUM('en_cours', 'terminee', 'annulee') DEFAULT 'en_cours',
    date_consultation DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (medecin_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: familles_articles
-- Référentiel des familles/catégories d'articles.
-- Une famille peut être utilisée par plusieurs articles, mais un article
-- appartient à une seule famille.
-- ============================================================
CREATE TABLE IF NOT EXISTS familles_articles (
    id SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL,
    libelle VARCHAR(100) NOT NULL,
    couleur VARCHAR(7) NOT NULL DEFAULT '#0D47A1',
    ordre_affichage SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    actif BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_familles_articles_code (code),
    UNIQUE KEY uk_familles_articles_libelle (libelle),
    KEY idx_familles_articles_actif_ordre (actif, ordre_affichage)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: medicaments
-- ============================================================
CREATE TABLE IF NOT EXISTS medicaments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    famille_article_id SMALLINT UNSIGNED NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    nom_commercial VARCHAR(150) NOT NULL,
    nom_generique VARCHAR(150),
    forme VARCHAR(50),
    dosage VARCHAR(50),
    unite VARCHAR(20) DEFAULT 'comprimé',
    prix_unitaire DECIMAL(10, 2) NOT NULL,
    stock_actuel INT DEFAULT 0,
    stock_minimum INT DEFAULT 10,
    emplacement VARCHAR(100),
    fournisseur VARCHAR(150),
    date_expiration DATE,
    statut ENUM('actif', 'rupture', 'perime') DEFAULT 'actif',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_medicaments_famille_article (famille_article_id),
    CONSTRAINT fk_medicaments_famille_article
        FOREIGN KEY (famille_article_id) REFERENCES familles_articles(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: prescriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS prescriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    consultation_id INT NOT NULL,
    medicament_id INT NOT NULL,
    posologie VARCHAR(200) NOT NULL,
    duree_jours INT,
    quantite INT NOT NULL,
    instructions TEXT,
    statut ENUM('en_attente', 'delivre', 'annule') DEFAULT 'en_attente',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE CASCADE,
    FOREIGN KEY (medicament_id) REFERENCES medicaments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: examens
-- ============================================================
CREATE TABLE IF NOT EXISTS examens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    consultation_id INT,
    patient_id INT NOT NULL,
    type_examen VARCHAR(100) NOT NULL,
    description TEXT,
    resultat TEXT,
    fichier_joint VARCHAR(255),
    prix DECIMAL(10, 2),
    statut ENUM('demande', 'en_cours', 'termine', 'annule') DEFAULT 'demande',
    date_examen DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: factures
-- ============================================================
CREATE TABLE IF NOT EXISTS factures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    consultation_id INT,
    numero_facture VARCHAR(50) UNIQUE NOT NULL,
    type_paiement ENUM('cash', 'assurance', 'corporatif') NOT NULL,
    montant_total DECIMAL(12, 2) NOT NULL,
    montant_paye DECIMAL(12, 2) DEFAULT 0,
    statut ENUM('en_attente', 'partiel', 'paye', 'annule') DEFAULT 'en_attente',
    societe_id INT,
    date_facture DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_echeance DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    FOREIGN KEY (consultation_id) REFERENCES consultations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: details_facture
-- ============================================================
CREATE TABLE IF NOT EXISTS details_facture (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facture_id INT NOT NULL,
    description VARCHAR(255) NOT NULL,
    quantite INT DEFAULT 1,
    prix_unitaire DECIMAL(10, 2) NOT NULL,
    sous_total DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (facture_id) REFERENCES factures(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: societes (assurance/corporatif)
-- ============================================================
CREATE TABLE IF NOT EXISTS societes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(200) NOT NULL,
    adresse TEXT,
    telephone VARCHAR(20),
    email VARCHAR(100),
    numero_contrat VARCHAR(100),
    taux_remboursement DECIMAL(5, 2) DEFAULT 0,
    plafond_annuel DECIMAL(12, 2),
    date_debut_contrat DATE,
    date_fin_contrat DATE,
    statut ENUM('actif', 'inactif', 'expiré') DEFAULT 'actif',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: messages
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    expediteur_id INT NOT NULL,
    destinataire_id INT,
    sujet VARCHAR(200),
    contenu TEXT NOT NULL,
    lu BOOLEAN DEFAULT FALSE,
    date_envoi DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expediteur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE,
    FOREIGN KEY (destinataire_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: demande_achats
-- ============================================================
CREATE TABLE IF NOT EXISTS demande_achats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    demandeur_id INT NOT NULL,
    numero_demande VARCHAR(50) UNIQUE NOT NULL,
    service VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    justification TEXT,
    quantite_demandee INT,
    montant_estime DECIMAL(12, 2),
    statut ENUM('brouillon', 'soumise', 'approuvee', 'rejetee', 'commandee') DEFAULT 'brouillon',
    approbateur_id INT,
    date_soumission DATETIME,
    date_approuvement DATETIME,
    observations TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (demandeur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE,
    FOREIGN KEY (approbateur_id) REFERENCES utilisateurs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Table: mouvements_stock
-- ============================================================
CREATE TABLE IF NOT EXISTS mouvements_stock (
    id INT AUTO_INCREMENT PRIMARY KEY,
    medicament_id INT,
    type_mouvement ENUM('entree', 'sortie', 'ajustement') NOT NULL,
    quantite INT NOT NULL,
    motif VARCHAR(255),
    reference_document VARCHAR(100),
    utilisateur_id INT NOT NULL,
    date_mouvement DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (medicament_id) REFERENCES medicaments(id) ON DELETE SET NULL,
    FOREIGN KEY (utilisateur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- INDEX pour optimisation des performances
-- ============================================================
CREATE INDEX idx_patients_numero ON patients(numero_dossier);
CREATE INDEX idx_patients_nom ON patients(nom);
CREATE INDEX idx_consultations_patient ON consultations(patient_id);
CREATE INDEX idx_consultations_medecin ON consultations(medecin_id);
CREATE INDEX idx_consultations_date ON consultations(date_consultation);
CREATE INDEX idx_prescriptions_consultation ON prescriptions(consultation_id);
CREATE INDEX idx_examens_patient ON examens(patient_id);
CREATE INDEX idx_factures_patient ON factures(patient_id);
CREATE INDEX idx_messages_expediteur ON messages(expediteur_id);
CREATE INDEX idx_messages_destinataire ON messages(destinataire_id);

-- ============================================================
-- FIN DU SCRIPT
-- ============================================================
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
-- Référentiel des familles d'articles
-- ============================================================
-- ON DUPLICATE KEY UPDATE permet de rejouer ce script sans créer de doublons.
INSERT INTO familles_articles (code, libelle, couleur, ordre_affichage, actif) VALUES
('MEDIC', 'Médicaments', '#0D47A1', 1, TRUE),
('LABO', 'Laboratoire', '#10B981', 2, TRUE),
('DENT', 'Dentaire', '#8B5CF6', 3, TRUE),
('ECHO', 'Échographie', '#F59E0B', 4, TRUE),
('CONSULT', 'Consultation', '#06B6D4', 5, TRUE),
('HOSPIT', 'Hospitalisation', '#F43F5E', 6, TRUE),
('BLOC', 'Bloc opératoire', '#F97316', 7, TRUE)
ON DUPLICATE KEY UPDATE
    libelle = VALUES(libelle),
    couleur = VALUES(couleur),
    ordre_affichage = VALUES(ordre_affichage),
    actif = VALUES(actif);

SET @famille_medicaments_id := (
    SELECT id FROM familles_articles WHERE code = 'MEDIC' LIMIT 1
);

-- ============================================================
-- Médicaments de base
-- ============================================================

INSERT INTO medicaments (famille_article_id, code, nom_commercial, nom_generique, forme, dosage, prix_unitaire, stock_actuel, stock_minimum, emplacement, fournisseur) VALUES
-- Analgésiques
(@famille_medicaments_id, 'MED001', 'Doliprane 500mg', 'Paracétamol', 'Comprimé', '500mg', 0.50, 500, 50, 'A1-01', 'Pharmacie Centrale'),
(@famille_medicaments_id, 'MED002', 'Spasfon 80mg', 'Phloroglucinol', 'Comprimé', '80mg', 1.20, 200, 30, 'A1-02', 'Pharmacie Centrale'),
(@famille_medicaments_id, 'MED003', 'Brufen 400mg', 'Ibuprofène', 'Comprimé', '400mg', 0.80, 300, 40, 'A1-03', 'Pharmacie Centrale'),

-- Antibiotiques
(@famille_medicaments_id, 'MED004', 'Amoxicilline 500mg', 'Amoxicilline', 'Gélule', '500mg', 1.50, 400, 50, 'B2-01', 'Pharmacie Centrale'),
(@famille_medicaments_id, 'MED005', 'Azithromycine 250mg', 'Azithromycine', 'Comprimé', '250mg', 3.00, 150, 20, 'B2-02', 'Pharmacie Centrale'),
(@famille_medicaments_id, 'MED006', 'Ciprox 500mg', 'Ciprofloxacine', 'Comprimé', '500mg', 2.00, 200, 30, 'B2-03', 'Pharmacie Centrale'),

-- Anti-inflammatoires
(@famille_medicaments_id, 'MED007', 'Voltarène 50mg', 'Diclofénac', 'Comprimé', '50mg', 1.00, 250, 40, 'C1-01', 'Pharmacie Centrale'),
(@famille_medicaments_id, 'MED008', 'Prednisolone 20mg', 'Prednisolone', 'Comprimé', '20mg', 0.70, 180, 30, 'C1-02', 'Pharmacie Centrale'),

-- Anti-hypertenseurs
(@famille_medicaments_id, 'MED009', 'Amlor 5mg', 'Amlodipine', 'Comprimé', '5mg', 2.50, 100, 20, 'D1-01', 'Pharmacie Centrale'),
(@famille_medicaments_id, 'MED010', 'Lasix 40mg', 'Furosémide', 'Comprimé', '40mg', 1.80, 120, 25, 'D1-02', 'Pharmacie Centrale'),

-- Anti-diabétiques
(@famille_medicaments_id, 'MED011', 'Metformine 500mg', 'Metformine', 'Comprimé', '500mg', 0.60, 200, 30, 'E1-01', 'Pharmacie Centrale'),
(@famille_medicaments_id, 'MED012', 'Glibenclamide 5mg', 'Glibenclamide', 'Comprimé', '5mg', 0.90, 150, 25, 'E1-02', 'Pharmacie Centrale'),

-- Vitamines et suppléments
(@famille_medicaments_id, 'MED013', 'Multivitamines', 'Complexe vitaminique', 'Comprimé', '-', 1.00, 300, 50, 'F1-01', 'Pharmacie Centrale'),
(@famille_medicaments_id, 'MED014', 'Ferograd 500mg', 'Sulfate ferreux', 'Comprimé', '500mg', 1.20, 200, 30, 'F1-02', 'Pharmacie Centrale'),

-- Solution injectable
(@famille_medicaments_id, 'MED015', 'Serum physiologique 100ml', 'NaCl 0.9%', 'Solution injectable', '100ml', 2.00, 100, 20, 'R1-01', 'Pharmacie Centrale'),
(@famille_medicaments_id, 'MED016', 'Glucose 5% 250ml', 'Glucose', 'Solution injectable', '250ml', 2.50, 80, 15, 'R1-02', 'Pharmacie Centrale');

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
