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
