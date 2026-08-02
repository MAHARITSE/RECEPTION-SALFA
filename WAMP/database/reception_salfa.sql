-- ============================================================================
--  RECEPTION SALFA — Schéma MySQL normalisé (WAMP / phpMyAdmin)
--  ============================================================================
--  Ce script crée la base `reception_salfa` et toutes les tables normalisées
--  utilisées par l'API PHP (api/index.php) et l'application compilée.
--
--  Philosophie (inspirée de LogBara / Bar POS) :
--    * UNE table par entité métier (patients, consultations, ventes, ...) ;
--    * les colonnes utiles à l'interrogation sont des colonnes réelles
--      (id, nom, date, statut, montants...) ;
--    * les structures profondément imbriquées (constantes vitales, lignes,
--      prescriptions, ...) sont conservées de façon FIDÈLE dans la colonne
--      `data_json` (JSON) pour garantir un aller-retour sans perte avec
--      l'application React.
--
--  → Importer ce fichier dans phpMyAdmin (base : reception_salfa).
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `reception_salfa`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `reception_salfa`;

-- ----------------------------------------------------------------------------
--  Paramètres d'impression / établissement (1 seule ligne : id = 'default')
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `parametres_impression` (
  `id`            VARCHAR(64) NOT NULL,
  `facility_name` VARCHAR(255) DEFAULT NULL,
  `currency`      VARCHAR(8)   DEFAULT NULL,
  `data_json`     LONGTEXT    NOT NULL,
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Compteurs séquentiels (n° de facture, clôtures livraison pharmacie, dossiers)
--  rows : id='factureCounter' / 'pharmaClosingCounter' / 'dossierCounter'
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `compteurs` (
  `id`         VARCHAR(64) NOT NULL,
  `value`      BIGINT      NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Utilisateurs / comptes de connexion
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `utilisateurs` (
  `id`       VARCHAR(64) NOT NULL,
  `name`     VARCHAR(255) DEFAULT NULL,
  `role`     VARCHAR(32)  DEFAULT NULL,
  `data_json` LONGTEXT   NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_utilisateurs_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Patients
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `patients` (
  `id`            VARCHAR(64) NOT NULL,
  `dossier`       VARCHAR(64) DEFAULT NULL,
  `matricule`     VARCHAR(64) DEFAULT NULL,
  `first_name`    VARCHAR(255) DEFAULT NULL,
  `last_name`     VARCHAR(255) DEFAULT NULL,
  `gender`        VARCHAR(4)   DEFAULT NULL,
  `status`        VARCHAR(40)  DEFAULT NULL,
  `client_type`   VARCHAR(16)  DEFAULT NULL,
  `company`       VARCHAR(255) DEFAULT NULL,
  `registered_at` VARCHAR(64)  DEFAULT NULL,
  `data_json`     LONGTEXT   NOT NULL,
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_patients_dossier` (`dossier`),
  KEY `idx_patients_statut` (`status`),
  KEY `idx_patients_nom` (`last_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Consultations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `consultations` (
  `id`         VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) DEFAULT NULL,
  `doctor_id`  VARCHAR(64) DEFAULT NULL,
  `doctor_name` VARCHAR(255) DEFAULT NULL,
  `date`       VARCHAR(64) DEFAULT NULL,
  `data_json`  LONGTEXT   NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_consultations_patient` (`patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Factures historiques (compatibilité)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `factures` (
  `id`              VARCHAR(64) NOT NULL,
  `patient_id`      VARCHAR(64) DEFAULT NULL,
  `consultation_id` VARCHAR(64) DEFAULT NULL,
  `client_type`     VARCHAR(16) DEFAULT NULL,
  `status`          VARCHAR(16) DEFAULT NULL,
  `total_amount`    DECIMAL(15,2) DEFAULT 0,
  `created_at`      VARCHAR(64) DEFAULT NULL,
  `data_json`       LONGTEXT   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_factures_patient` (`patient_id`),
  KEY `idx_factures_statut` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Table unifiée des VENTES (en-têtes) — entité centrale du reporting caisse
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ventes` (
  `id`              VARCHAR(64) NOT NULL,
  `patient_id`      VARCHAR(64) DEFAULT NULL,
  `consultation_id` VARCHAR(64) DEFAULT NULL,
  `numero_facture`  VARCHAR(64) DEFAULT NULL,
  `type`            VARCHAR(24) DEFAULT NULL,
  `client_type`     VARCHAR(16) DEFAULT NULL,
  `company`         VARCHAR(255) DEFAULT NULL,
  `status`          VARCHAR(16) DEFAULT NULL,
  `montant_facture` DECIMAL(15,2) DEFAULT 0,
  `montant_paye`    DECIMAL(15,2) DEFAULT 0,
  `date_vente`      VARCHAR(64) DEFAULT NULL,
  `source`          VARCHAR(16) DEFAULT NULL,
  `closing_id`      VARCHAR(64) DEFAULT NULL,
  `data_json`       LONGTEXT   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ventes_numero` (`numero_facture`),
  KEY `idx_ventes_type` (`type`),
  KEY `idx_ventes_status` (`status`),
  KEY `idx_ventes_date` (`date_vente`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Lignes de vente (1:N vers ventes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lignes_vente` (
  `id`         VARCHAR(64) NOT NULL,
  `vente_id`   VARCHAR(64) NOT NULL,
  `article_id` VARCHAR(64) DEFAULT NULL,
  `article_name` VARCHAR(255) DEFAULT NULL,
  `quantity`   DECIMAL(15,2) DEFAULT 0,
  `unit_price` DECIMAL(15,2) DEFAULT 0,
  `data_json`  LONGTEXT   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_lignes_vente_vente` (`vente_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Paiements rattachés aux ventes (paiements partiels)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `paiements_vente` (
  `id`       VARCHAR(64) NOT NULL,
  `vente_id` VARCHAR(64) NOT NULL,
  `amount`   DECIMAL(15,2) DEFAULT 0,
  `method`   VARCHAR(40) DEFAULT NULL,
  `date`     VARCHAR(64) DEFAULT NULL,
  `data_json` LONGTEXT  NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_paiements_vente_vente` (`vente_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Catalogue articles / médicaments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `articles` (
  `id`            VARCHAR(64) NOT NULL,
  `name`          VARCHAR(255) DEFAULT NULL,
  `family`        VARCHAR(8)   DEFAULT NULL,
  `unit`          VARCHAR(32)  DEFAULT NULL,
  `stock_central` DECIMAL(15,2) DEFAULT 0,
  `stock_pharmacie` DECIMAL(15,2) DEFAULT 0,
  `barcode`       VARCHAR(64)  DEFAULT NULL,
  `data_json`     LONGTEXT   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_articles_famille` (`family`),
  KEY `idx_articles_nom` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Sociétés conventionnées (facturation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `societes` (
  `id`             VARCHAR(64) NOT NULL,
  `name`           VARCHAR(255) DEFAULT NULL,
  `settlement_mode` VARCHAR(24) DEFAULT NULL,
  `data_json`      LONGTEXT   NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Comptes de facturation mensuels des sociétés
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `comptes_facturation_societes` (
  `id`            VARCHAR(64) NOT NULL,
  `company`       VARCHAR(255) DEFAULT NULL,
  `month`         VARCHAR(8)   DEFAULT NULL,
  `status`        VARCHAR(16)  DEFAULT NULL,
  `total_amount`  DECIMAL(15,2) DEFAULT 0,
  `paid_amount`   DECIMAL(15,2) DEFAULT 0,
  `data_json`     LONGTEXT   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_comptes_societes_mois` (`company`, `month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Fournisseurs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fournisseurs` (
  `id`      VARCHAR(64) NOT NULL,
  `name`    VARCHAR(255) DEFAULT NULL,
  `phone`   VARCHAR(64)  DEFAULT NULL,
  `data_json` LONGTEXT  NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Familles d'articles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `familles` (
  `id`       VARCHAR(64) NOT NULL,
  `code`     VARCHAR(32) DEFAULT NULL,
  `name`     VARCHAR(255) DEFAULT NULL,
  `color`    VARCHAR(16) DEFAULT NULL,
  `data_json` LONGTEXT  NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Services destinataires du dépôt (pharmacie, bloc, soins...)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `services_depot` (
  `id`       VARCHAR(64) NOT NULL,
  `code`     VARCHAR(32) DEFAULT NULL,
  `name`     VARCHAR(255) DEFAULT NULL,
  `kind`     VARCHAR(16) DEFAULT NULL,
  `active`   TINYINT(1) DEFAULT 1,
  `data_json` LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Catalogue laboratoire (examens)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `catalogue_laboratoire` (
  `id`       VARCHAR(64) NOT NULL,
  `code`     VARCHAR(64) DEFAULT NULL,
  `name`     VARCHAR(255) DEFAULT NULL,
  `category` VARCHAR(32) DEFAULT NULL,
  `data_json` LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Demandes d'analyses laboratoire
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `demandes_laboratoire` (
  `id`         VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) DEFAULT NULL,
  `consultation_id` VARCHAR(64) DEFAULT NULL,
  `exam_type`  VARCHAR(255) DEFAULT NULL,
  `status`     VARCHAR(24) DEFAULT NULL,
  `urgent`     TINYINT(1) DEFAULT 0,
  `requested_at` VARCHAR(64) DEFAULT NULL,
  `data_json`  LONGTEXT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_demandes_laboratoire_patient` (`patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Parcours patient (timeline)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `parcours_patient` (
  `id`         VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) DEFAULT NULL,
  `timestamp`  VARCHAR(64) DEFAULT NULL,
  `department` VARCHAR(24) DEFAULT NULL,
  `action`     VARCHAR(255) DEFAULT NULL,
  `data_json`  LONGTEXT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_parcours_patient_patient` (`patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Clôtures de caisse (Z)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `clotures_caisse` (
  `id`         VARCHAR(64) NOT NULL,
  `date`       VARCHAR(64) DEFAULT NULL,
  `cashier_id` VARCHAR(64) DEFAULT NULL,
  `grand_total` DECIMAL(15,2) DEFAULT 0,
  `data_json`  LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Journal d'audit
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `journaux_audit` (
  `id`        VARCHAR(64) NOT NULL,
  `timestamp` VARCHAR(64) DEFAULT NULL,
  `user_id`   VARCHAR(64) DEFAULT NULL,
  `action`    VARCHAR(255) DEFAULT NULL,
  `data_json` LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Notifications
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`          VARCHAR(64) NOT NULL,
  `target_role` VARCHAR(32) DEFAULT NULL,
  `type`        VARCHAR(16) DEFAULT NULL,
  `timestamp`   VARCHAR(64) DEFAULT NULL,
  `read_flag`   TINYINT(1) DEFAULT 0,
  `data_json`   LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Messagerie interne
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `messages` (
  `id`           VARCHAR(64) NOT NULL,
  `from_user_id` VARCHAR(64) DEFAULT NULL,
  `to_user_id`   VARCHAR(64) DEFAULT NULL,
  `timestamp`    VARCHAR(64) DEFAULT NULL,
  `read_flag`    TINYINT(1) DEFAULT 0,
  `data_json`    LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Demandes de transfert de stock (central → service)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transferts_stock` (
  `id`          VARCHAR(64) NOT NULL,
  `article_id`  VARCHAR(64) DEFAULT NULL,
  `quantity`    DECIMAL(15,2) DEFAULT 0,
  `status`      VARCHAR(16) DEFAULT NULL,
  `target_service_id` VARCHAR(64) DEFAULT NULL,
  `requested_at` VARCHAR(64) DEFAULT NULL,
  `data_json`   LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Entrées de stock (réceptions / achats)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `entrees_stock` (
  `id`          VARCHAR(64) NOT NULL,
  `article_id`  VARCHAR(64) DEFAULT NULL,
  `quantity`    DECIMAL(15,2) DEFAULT 0,
  `supplier`    VARCHAR(255) DEFAULT NULL,
  `date`        VARCHAR(64) DEFAULT NULL,
  `data_json`   LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Mouvements de stock (entrées/sorties/transferts/inventaire)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `mouvements_stock` (
  `id`          VARCHAR(64) NOT NULL,
  `type`        VARCHAR(20) DEFAULT NULL,
  `article_id`  VARCHAR(64) DEFAULT NULL,
  `quantity`    DECIMAL(15,2) DEFAULT 0,
  `date`        VARCHAR(64) DEFAULT NULL,
  `from_location` VARCHAR(64) DEFAULT NULL,
  `to_location`   VARCHAR(64) DEFAULT NULL,
  `data_json`   LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  En-têtes de mouvement (achat, vente, transfert, inventaire, sortie)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `entetes_mouvements` (
  `id`      VARCHAR(64) NOT NULL,
  `type`    VARCHAR(20) DEFAULT NULL,
  `ref`     VARCHAR(64) DEFAULT NULL,
  `date`    VARCHAR(64) DEFAULT NULL,
  `user_id` VARCHAR(64) DEFAULT NULL,
  `data_json` LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Lignes de mouvement (1:N vers entetes_mouvements)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lignes_mouvements` (
  `id`          VARCHAR(64) NOT NULL,
  `movement_id` VARCHAR(64) NOT NULL,
  `article_id`  VARCHAR(64) DEFAULT NULL,
  `article_name` VARCHAR(255) DEFAULT NULL,
  `quantity`    DECIMAL(15,2) DEFAULT 0,
  `data_json`   LONGTEXT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_lignes_mouvements_entete` (`movement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Sessions d'inventaire
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `sessions_inventaire` (
  `id`          VARCHAR(64) NOT NULL,
  `location`    VARCHAR(64) DEFAULT NULL,
  `status`      VARCHAR(16) DEFAULT NULL,
  `started_at`  VARCHAR(64) DEFAULT NULL,
  `started_by`  VARCHAR(64) DEFAULT NULL,
  `data_json`   LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Lignes de livraison de pharmacie
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lignes_livraison_pharmacie` (
  `id`             VARCHAR(64) NOT NULL,
  `consultation_id` VARCHAR(64) DEFAULT NULL,
  `patient_id`     VARCHAR(64) DEFAULT NULL,
  `article_name`   VARCHAR(255) DEFAULT NULL,
  `quantity`       DECIMAL(15,2) DEFAULT 0,
  `delivered_at`   VARCHAR(64) DEFAULT NULL,
  `data_json`      LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Clôtures / compilations des livraisons de pharmacie (garde)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `clotures_livraison_pharmacie` (
  `id`            VARCHAR(64) NOT NULL,
  `closing_number` VARCHAR(64) DEFAULT NULL,
  `date`          VARCHAR(64) DEFAULT NULL,
  `total_amount`  DECIMAL(15,2) DEFAULT 0,
  `data_json`     LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Dossiers Hospitalisation / Bloc opératoire
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `dossiers_hospitalisation_bloc` (
  `id`          VARCHAR(64) NOT NULL,
  `patient_id`  VARCHAR(64) DEFAULT NULL,
  `patient_name` VARCHAR(255) DEFAULT NULL,
  `type`        VARCHAR(8) DEFAULT NULL,
  `client_type` VARCHAR(16) DEFAULT NULL,
  `opened_at`   VARCHAR(64) DEFAULT NULL,
  `data_json`   LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
--  Données d'exemple
-- ============================================================================
--  Ces données de démonstration proviennent de src/data/localData.json.
--  Elles sont ajoutées uniquement lorsqu'une table est vide : un nouvel import
--  du schéma ne remplace donc jamais les données déjà saisies dans MySQL.
--  À ne pas utiliser comme jeu de données de production.
-- ============================================================================

SET NAMES utf8mb4;

-- Exemples : parametres_impression (1 ligne(s))
INSERT INTO `parametres_impression` (`id`, `data_json`, `facility_name`, `currency`)
SELECT `id`, `data_json`, `facility_name`, `currency`
FROM (
    SELECT 'default' AS `id`, '{"facilityName":"SALFA — Centre de Santé","address":"Antananarivo, Madagascar","phone":"","nif":"","logoUrl":"","secondLogoUrl":"","receiptTitle":"REÇU DE PAIEMENT","footerMessage":"Merci de votre visite. Prompt rétablissement !","paperWidth":80,"autoPrint":true,"showLogo":true,"showBarcode":true,"showSignature":true,"copies":1,"currency":"Ar","paymentMethods":["Espèces","Carte bancaire","Mobile Money","Virement","Chèque"],"invoicePrefix":"FAC","id":"default"}' AS `data_json`, 'SALFA — Centre de Santé' AS `facility_name`, 'Ar' AS `currency`
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `parametres_impression`);

-- Exemples : utilisateurs (11 ligne(s))
INSERT INTO `utilisateurs` (`id`, `data_json`, `name`, `role`)
SELECT `id`, `data_json`, `name`, `role`
FROM (
    SELECT 'USR-ADMIN' AS `id`, '{"id":"USR-ADMIN","name":"Admin Système","role":"admin","password":"admin123"}' AS `data_json`, 'Admin Système' AS `name`, 'admin' AS `role`
    UNION ALL SELECT 'USR-REC', '{"id":"USR-REC","name":"Aina Rakoto","role":"receptionist","password":"rec123"}', 'Aina Rakoto', 'receptionist'
    UNION ALL SELECT 'USR-DOC', '{"id":"USR-DOC","name":"Dr. Feno Rasoana","role":"doctor","password":"doc123"}', 'Dr. Feno Rasoana', 'doctor'
    UNION ALL SELECT 'USR-DOC2', '{"id":"USR-DOC2","name":"Dr. Mialy Andria","role":"doctor","password":"doc123"}', 'Dr. Mialy Andria', 'doctor'
    UNION ALL SELECT 'USR-CASH', '{"id":"USR-CASH","name":"Caisse 1 - Miora Kanto","role":"cashier","password":"caisse123"}', 'Caisse 1 - Miora Kanto', 'cashier'
    UNION ALL SELECT 'USR-CASH2', '{"id":"USR-CASH2","name":"Caisse 2 - Pierre Duval","role":"cashier","password":"caisse123"}', 'Caisse 2 - Pierre Duval', 'cashier'
    UNION ALL SELECT 'USR-PHA', '{"id":"USR-PHA","name":"Pharmacie 1 - Tiana Soa","role":"pharmacy","password":"pharma123"}', 'Pharmacie 1 - Tiana Soa', 'pharmacy'
    UNION ALL SELECT 'USR-PHA2', '{"id":"USR-PHA2","name":"Pharmacie 2 - Fatima Benali","role":"pharmacy","password":"pharma123"}', 'Pharmacie 2 - Fatima Benali', 'pharmacy'
    UNION ALL SELECT 'USR-LAB', '{"id":"USR-LAB","name":"Hery Lanto","role":"laboratory","password":"labo123"}', 'Hery Lanto', 'laboratory'
    UNION ALL SELECT 'USR-MAG', '{"id":"USR-MAG","name":"Niry Tahina","role":"magasinier","password":"mag123"}', 'Niry Tahina', 'magasinier'
    UNION ALL SELECT 'USR-BIL', '{"id":"USR-BIL","name":"Lova Sitraka","role":"billing","password":"fact123"}', 'Lova Sitraka', 'billing'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `utilisateurs`);

-- Exemples : patients (7 ligne(s))
INSERT INTO `patients` (`id`, `data_json`, `dossier`, `matricule`, `first_name`, `last_name`, `gender`, `status`, `client_type`, `company`, `registered_at`)
SELECT `id`, `data_json`, `dossier`, `matricule`, `first_name`, `last_name`, `gender`, `status`, `client_type`, `company`, `registered_at`
FROM (
    SELECT 'pat-000001' AS `id`, '{"id":"pat-000001","dossier":"DOS-260001","matricule":"MAT-JIRAMA-0001","firstName":"Marie","lastName":"RAHARISON","dateOfBirth":"1990-07-22","age":"36 Ans","gender":"F","address":"Lot II M 34, Antananarivo","contact":"034 12 345 67","ssn":"","insureName":"JIRAMA","clientType":"societe","company":"JIRAMA","subCompany":"Direction Régionale Analamanga","allergies":[],"chronicTreatments":[],"antecedents":[],"bloodGroup":"A+","registeredAt":"2026-07-15T08:30:00.000Z","registeredBy":"Aina Rakoto","status":"completed","lastVisitAt":"2026-08-01T11:50:00.000Z"}' AS `data_json`, 'DOS-260001' AS `dossier`, 'MAT-JIRAMA-0001' AS `matricule`, 'Marie' AS `first_name`, 'RAHARISON' AS `last_name`, 'F' AS `gender`, 'completed' AS `status`, 'societe' AS `client_type`, 'JIRAMA' AS `company`, '2026-07-15T08:30:00.000Z' AS `registered_at`
    UNION ALL SELECT 'pat-000002', '{"id":"pat-000002","dossier":"DOS-260002","firstName":"Solo","lastName":"RAKOTO","dateOfBirth":"2015-11-08","age":"10 Ans","gender":"M","address":"Lot 67 Ha, Fianarantsoa","contact":"033 11 222 33","ssn":"","insureName":"RAKOTO Jean (père)","clientType":"comptoir","allergies":["Aspirine"],"chronicTreatments":[],"antecedents":["Asthme"],"bloodGroup":"B+","registeredAt":"2026-07-20T09:00:00.000Z","registeredBy":"Aina Rakoto","status":"medications_delivered","lastVisitAt":"2026-07-30T15:05:00.000Z"}', 'DOS-260002', NULL, 'Solo', 'RAKOTO', 'M', 'medications_delivered', 'comptoir', NULL, '2026-07-20T09:00:00.000Z'
    UNION ALL SELECT 'pat-000003', '{"id":"pat-000003","dossier":"DOS-260003","matricule":"MAT-TELMA-0003","firstName":"Voahirana","lastName":"RANDRIANASOLO","dateOfBirth":"1985-03-14","age":"41 Ans","gender":"F","address":"Lot III K 12, Antsirabe","contact":"032 45 678 90","ssn":"","insureName":"TELMA","clientType":"societe","company":"TELMA","allergies":[],"chronicTreatments":[],"antecedents":[],"bloodGroup":"O+","registeredAt":"2026-08-01T07:45:00.000Z","registeredBy":"Aina Rakoto","status":"consulted_awaiting_payment","lastVisitAt":"2026-08-01T10:05:00.000Z"}', 'DOS-260003', 'MAT-TELMA-0003', 'Voahirana', 'RANDRIANASOLO', 'F', 'consulted_awaiting_payment', 'societe', 'TELMA', '2026-08-01T07:45:00.000Z'
    UNION ALL SELECT 'pat-000004', '{"id":"pat-000004","dossier":"DOS-260004","firstName":"Tiana","lastName":"MBOLA","dateOfBirth":"1978-06-02","age":"48 Ans","gender":"M","address":"Anosy, Antananarivo","contact":"038 22 333 44","ssn":"","clientType":"comptoir","allergies":[],"chronicTreatments":[],"antecedents":[],"bloodGroup":"O-","vitalSigns":{"temperature":"37.8","bloodPressureSystolic":"138","bloodPressureDiastolic":"89","heartRate":"92","oxygenSaturation":"98","weight":"78","height":"172"},"registeredAt":"2026-08-02T06:30:00.000Z","registeredBy":"Aina Rakoto","status":"waiting_consultation","assignedDoctor":"USR-DOC","assignedSpecialty":"Médecine Générale","lastVisitAt":"2026-08-02T06:30:00.000Z"}', 'DOS-260004', NULL, 'Tiana', 'MBOLA', 'M', 'waiting_consultation', 'comptoir', NULL, '2026-08-02T06:30:00.000Z'
    UNION ALL SELECT 'pat-000005', '{"id":"pat-000005","dossier":"DOS-260005","firstName":"Niry","lastName":"ANDRIAMAHEFA","dateOfBirth":"2001-12-25","age":"24 Ans","gender":"F","address":"Mahazina, Mahajanga","contact":"032 55 666 77","ssn":"","clientType":"comptoir","allergies":[],"chronicTreatments":[],"antecedents":[],"bloodGroup":"AB+","registeredAt":"2026-07-28T10:15:00.000Z","registeredBy":"Aina Rakoto","status":"analyses_complete","lastVisitAt":"2026-07-29T11:00:00.000Z"}', 'DOS-260005', NULL, 'Niry', 'ANDRIAMAHEFA', 'F', 'analyses_complete', 'comptoir', NULL, '2026-07-28T10:15:00.000Z'
    UNION ALL SELECT 'pat-000006', '{"id":"pat-000006","dossier":"DOS-260006","matricule":"MAT-AIRMAD-0006","firstName":"Hery","lastName":"RASOLOFOMANANA","dateOfBirth":"1969-09-09","age":"56 Ans","gender":"M","address":"Ivato, Antananarivo","contact":"034 88 999 00","ssn":"","insureName":"AIR MADAGASCAR","clientType":"societe","company":"AIR MADAGASCAR","allergies":[],"chronicTreatments":["Amlodipine 5mg"],"antecedents":["HTA"],"bloodGroup":"A-","registeredAt":"2026-07-10T08:00:00.000Z","registeredBy":"Aina Rakoto","status":"invoice_paid","lastVisitAt":"2026-08-01T09:30:00.000Z"}', 'DOS-260006', 'MAT-AIRMAD-0006', 'Hery', 'RASOLOFOMANANA', 'M', 'invoice_paid', 'societe', 'AIR MADAGASCAR', '2026-07-10T08:00:00.000Z'
    UNION ALL SELECT 'pat-000007', '{"id":"pat-000007","dossier":"DOS-260007","firstName":"Miora","lastName":"RABETOKOTANY","dateOfBirth":"1996-04-18","age":"30 Ans","gender":"F","address":"Ambohimanarina, Antananarivo","contact":"033 77 888 99","ssn":"","clientType":"comptoir","allergies":["Pénicilline"],"chronicTreatments":[],"antecedents":[],"bloodGroup":"B-","registeredAt":"2026-08-02T07:05:00.000Z","registeredBy":"Aina Rakoto","status":"registered","lastVisitAt":"2026-08-02T07:05:00.000Z"}', 'DOS-260007', NULL, 'Miora', 'RABETOKOTANY', 'F', 'registered', 'comptoir', NULL, '2026-08-02T07:05:00.000Z'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `patients`);

-- Exemples : consultations (5 ligne(s))
INSERT INTO `consultations` (`id`, `data_json`, `patient_id`, `doctor_id`, `doctor_name`, `date`)
SELECT `id`, `data_json`, `patient_id`, `doctor_id`, `doctor_name`, `date`
FROM (
    SELECT 'consult-000001' AS `id`, '{"id":"consult-000001","patientId":"pat-000001","doctorId":"USR-DOC","doctorName":"Dr. Feno Rasoana","date":"2026-08-01T09:12:00.000Z","vitalSigns":{"temperature":"38.9","bloodPressureSystolic":"125","bloodPressureDiastolic":"82","heartRate":"96","oxygenSaturation":"97","weight":"62","height":"165"},"visitReason":"Fièvre et céphalées depuis 3 jours","diagnosis":"Paludisme simple","notes":"Goutte épaisse positive. Traitement antipaludique + paracétamol.","prescriptions":[{"id":"presc-000001","articleId":"art-001","articleName":"Paracétamol 500mg","quantity":20,"posology":"1 cp matin, midi et soir","duration":"5 jours","instructions":"Après les repas","unitPrice":450,"discount":0,"delivered":true}],"labRequests":[{"id":"labreq-000001","patientId":"pat-000001","consultationId":"consult-000001","examType":"Goutte épaisse","code":"LAB007","category":"parasitologie","parameters":["Plasmodium"],"urgent":false,"status":"completed","sampleType":"Sang veineux","sampleReceived":true,"sampleReceivedAt":"2026-08-01T09:20:00.000Z","requestedBy":"USR-DOC","requestedAt":"2026-08-01T09:12:00.000Z","invoiceId":"inv-000001","price":9000,"results":[{"parameter":"Plasmodium","value":"Positif (P. falciparum)","isAbnormal":true,"comments":"Densité parasitaire faible"}],"completedAt":"2026-08-01T11:30:00.000Z","completedBy":"USR-LAB"}],"hospitalizeRequested":false,"surgeryRequested":false,"isEmergency":false}' AS `data_json`, 'pat-000001' AS `patient_id`, 'USR-DOC' AS `doctor_id`, 'Dr. Feno Rasoana' AS `doctor_name`, '2026-08-01T09:12:00.000Z' AS `date`
    UNION ALL SELECT 'consult-000002', '{"id":"consult-000002","patientId":"pat-000002","doctorId":"USR-DOC2","doctorName":"Dr. Mialy Andria","date":"2026-07-30T14:20:00.000Z","vitalSigns":{"temperature":"38.2","bloodPressureSystolic":"110","bloodPressureDiastolic":"70","heartRate":"100","oxygenSaturation":"96","weight":"32","height":"135"},"visitReason":"Toux persistante et fièvre","diagnosis":"Bronchite aiguë","notes":"Antibiothérapie 7 jours. Contrôle si persistance.","prescriptions":[{"id":"presc-000002","articleId":"art-002","articleName":"Amoxicilline 1g","quantity":14,"posology":"1 gélule matin et soir","duration":"7 jours","instructions":"Ne pas arrêter le traitement avant terme","unitPrice":2000,"discount":0,"delivered":true}],"labRequests":[],"hospitalizeRequested":false,"surgeryRequested":false,"isEmergency":false}', 'pat-000002', 'USR-DOC2', 'Dr. Mialy Andria', '2026-07-30T14:20:00.000Z'
    UNION ALL SELECT 'consult-000003', '{"id":"consult-000003","patientId":"pat-000003","doctorId":"USR-DOC","doctorName":"Dr. Feno Rasoana","date":"2026-08-01T10:05:00.000Z","vitalSigns":{"temperature":"37.1","bloodPressureSystolic":"120","bloodPressureDiastolic":"80","heartRate":"88","oxygenSaturation":"98","weight":"58","height":"160"},"visitReason":"Douleur épigastrique","diagnosis":"Gastrite aiguë probable","notes":"Repos alimentaire conseillé. Réévaluation après règlement.","prescriptions":[],"labRequests":[],"hospitalizeRequested":false,"surgeryRequested":false,"isEmergency":false}', 'pat-000003', 'USR-DOC', 'Dr. Feno Rasoana', '2026-08-01T10:05:00.000Z'
    UNION ALL SELECT 'consult-000004', '{"id":"consult-000004","patientId":"pat-000006","doctorId":"USR-DOC2","doctorName":"Dr. Mialy Andria","date":"2026-08-01T08:40:00.000Z","vitalSigns":{"temperature":"36.8","bloodPressureSystolic":"145","bloodPressureDiastolic":"95","heartRate":"78","oxygenSaturation":"98","weight":"84","height":"170"},"visitReason":"Suivi hypertension","diagnosis":"HTA stabilisée sous traitement","notes":"Poursuivre le traitement. Prochain contrôle dans 1 mois.","prescriptions":[{"id":"presc-000003","articleId":"art-011","articleName":"Amlodipine 5mg","quantity":30,"posology":"1 cp le matin","duration":"30 jours","instructions":"Prise quotidienne régulière","unitPrice":1300,"discount":0,"delivered":false}],"labRequests":[],"hospitalizeRequested":false,"surgeryRequested":false,"isEmergency":false}', 'pat-000006', 'USR-DOC2', 'Dr. Mialy Andria', '2026-08-01T08:40:00.000Z'
    UNION ALL SELECT 'consult-000005', '{"id":"consult-000005","patientId":"pat-000005","doctorId":"USR-DOC","doctorName":"Dr. Feno Rasoana","date":"2026-07-29T09:50:00.000Z","vitalSigns":{"temperature":"36.6","bloodPressureSystolic":"118","bloodPressureDiastolic":"76","heartRate":"72","oxygenSaturation":"99","weight":"55","height":"162"},"visitReason":"Bilan de contrôle diabète","diagnosis":"Diabète de type 2 — équilibré","notes":"Glycémie à jeun normale. Poursuite du régime alimentaire.","prescriptions":[],"labRequests":[{"id":"labreq-000002","patientId":"pat-000005","consultationId":"consult-000005","examType":"Glycémie à jeun","code":"LAB002","category":"biochimie","parameters":["Glucose"],"urgent":false,"status":"completed","sampleType":"Sang veineux","sampleReceived":true,"sampleReceivedAt":"2026-07-29T10:00:00.000Z","requestedBy":"USR-DOC","requestedAt":"2026-07-29T09:50:00.000Z","invoiceId":"inv-000005","price":8000,"results":[{"parameter":"Glucose","value":1.05,"unit":"g/L","normalMin":0.7,"normalMax":1.1,"isAbnormal":false}],"completedAt":"2026-07-29T11:00:00.000Z","completedBy":"USR-LAB"}],"hospitalizeRequested":false,"surgeryRequested":false,"isEmergency":false}', 'pat-000005', 'USR-DOC', 'Dr. Feno Rasoana', '2026-07-29T09:50:00.000Z'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `consultations`);

-- Exemples : factures (5 ligne(s))
INSERT INTO `factures` (`id`, `data_json`, `patient_id`, `consultation_id`, `client_type`, `status`, `total_amount`, `created_at`)
SELECT `id`, `data_json`, `patient_id`, `consultation_id`, `client_type`, `status`, `total_amount`, `created_at`
FROM (
    SELECT 'inv-000001' AS `id`, '{"id":"inv-000001","patientId":"pat-000001","consultationId":"consult-000001","clientName":"RAHARISON Marie","clientType":"societe","items":[{"description":"Consultation médicale","amount":10000,"category":"consultation"},{"description":"Paracétamol 500mg × 20","amount":9000,"category":"pharmacy"},{"description":"Goutte épaisse","amount":9000,"category":"lab"}],"totalAmount":28000,"patientCharge":0,"status":"paid","paidAt":"2026-08-01T11:45:00.000Z","paidBy":"USR-CASH","createdAt":"2026-08-01T09:15:00.000Z","isExternal":false}' AS `data_json`, 'pat-000001' AS `patient_id`, 'consult-000001' AS `consultation_id`, 'societe' AS `client_type`, 'paid' AS `status`, 28000 AS `total_amount`, '2026-08-01T09:15:00.000Z' AS `created_at`
    UNION ALL SELECT 'inv-000002', '{"id":"inv-000002","patientId":"pat-000002","consultationId":"consult-000002","clientName":"RAKOTO Solo","clientType":"comptoir","items":[{"description":"Consultation médicale","amount":10000,"category":"consultation"},{"description":"Amoxicilline 1g × 14","amount":28000,"category":"pharmacy"}],"totalAmount":38000,"patientCharge":38000,"status":"paid","paidAt":"2026-07-30T15:00:00.000Z","paidBy":"USR-CASH","createdAt":"2026-07-30T14:25:00.000Z","isExternal":false}', 'pat-000002', 'consult-000002', 'comptoir', 'paid', 38000, '2026-07-30T14:25:00.000Z'
    UNION ALL SELECT 'inv-000003', '{"id":"inv-000003","patientId":"pat-000003","consultationId":"consult-000003","clientName":"RANDRIANASOLO Voahirana","clientType":"societe","items":[{"description":"Consultation médicale","amount":10000,"category":"consultation"}],"totalAmount":10000,"patientCharge":0,"status":"pending","createdAt":"2026-08-01T10:10:00.000Z","isExternal":false}', 'pat-000003', 'consult-000003', 'societe', 'pending', 10000, '2026-08-01T10:10:00.000Z'
    UNION ALL SELECT 'inv-000004', '{"id":"inv-000004","patientId":"pat-000006","consultationId":"consult-000004","clientName":"RASOLOFOMANANA Hery","clientType":"societe","items":[{"description":"Consultation médicale","amount":10000,"category":"consultation"},{"description":"Amlodipine 5mg × 30","amount":39000,"category":"pharmacy"}],"totalAmount":49000,"patientCharge":0,"status":"paid","paidAt":"2026-08-01T09:30:00.000Z","paidBy":"USR-CASH2","createdAt":"2026-08-01T08:45:00.000Z","isExternal":false}', 'pat-000006', 'consult-000004', 'societe', 'paid', 49000, '2026-08-01T08:45:00.000Z'
    UNION ALL SELECT 'inv-000005', '{"id":"inv-000005","patientId":"pat-000005","consultationId":"consult-000005","clientName":"ANDRIAMAHEFA Niry","clientType":"comptoir","items":[{"description":"Consultation médicale","amount":10000,"category":"consultation"},{"description":"Glycémie à jeun","amount":8000,"category":"lab"}],"totalAmount":18000,"patientCharge":18000,"status":"paid","paidAt":"2026-07-29T10:10:00.000Z","paidBy":"USR-CASH","createdAt":"2026-07-29T09:55:00.000Z","isExternal":false}', 'pat-000005', 'consult-000005', 'comptoir', 'paid', 18000, '2026-07-29T09:55:00.000Z'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `factures`);

-- Exemples : ventes (5 ligne(s))
INSERT INTO `ventes` (`id`, `data_json`, `patient_id`, `consultation_id`, `numero_facture`, `type`, `client_type`, `company`, `status`, `montant_facture`, `montant_paye`, `date_vente`, `source`, `closing_id`)
SELECT `id`, `data_json`, `patient_id`, `consultation_id`, `numero_facture`, `type`, `client_type`, `company`, `status`, `montant_facture`, `montant_paye`, `date_vente`, `source`, `closing_id`
FROM (
    SELECT 'vente-000001' AS `id`, '{"id":"vente-000001","patientId":"pat-000005","consultationId":"consult-000005","numeroFacture":"FAC-2026-0001","type":"labo","clientType":"comptoir","clientName":"ANDRIAMAHEFA Niry","subtotal":18000,"remisePct":0,"remiseMontant":0,"montantFacture":18000,"montantPaye":18000,"status":"paid","isExterne":false,"source":"caisse","dateVente":"2026-07-29T09:55:00.000Z","datePaiement":"2026-07-29T10:10:00.000Z","paidAt":"2026-07-29T10:10:00.000Z","paidBy":"USR-CASH","paidByName":"Miora Kanto","createdAt":"2026-07-29T09:55:00.000Z","legacyInvoiceId":"inv-000005"}' AS `data_json`, 'pat-000005' AS `patient_id`, 'consult-000005' AS `consultation_id`, 'FAC-2026-0001' AS `numero_facture`, 'labo' AS `type`, 'comptoir' AS `client_type`, NULL AS `company`, 'paid' AS `status`, 18000 AS `montant_facture`, 18000 AS `montant_paye`, '2026-07-29T09:55:00.000Z' AS `date_vente`, 'caisse' AS `source`, NULL AS `closing_id`
    UNION ALL SELECT 'vente-000002', '{"id":"vente-000002","patientId":"pat-000002","consultationId":"consult-000002","numeroFacture":"FAC-2026-0002","type":"pharmacie","clientType":"comptoir","clientName":"RAKOTO Solo","subtotal":38000,"remisePct":0,"remiseMontant":0,"montantFacture":38000,"montantPaye":38000,"status":"paid","isExterne":false,"source":"caisse","dateVente":"2026-07-30T14:25:00.000Z","datePaiement":"2026-07-30T15:00:00.000Z","paidAt":"2026-07-30T15:00:00.000Z","paidBy":"USR-CASH","paidByName":"Miora Kanto","createdAt":"2026-07-30T14:25:00.000Z","legacyInvoiceId":"inv-000002"}', 'pat-000002', 'consult-000002', 'FAC-2026-0002', 'pharmacie', 'comptoir', NULL, 'paid', 38000, 38000, '2026-07-30T14:25:00.000Z', 'caisse', NULL
    UNION ALL SELECT 'vente-000003', '{"id":"vente-000003","patientId":"pat-000001","consultationId":"consult-000001","numeroFacture":"FAC-2026-0003","type":"pharmacie","clientType":"societe","clientName":"RAHARISON Marie","company":"JIRAMA","subtotal":28000,"remisePct":0,"remiseMontant":0,"montantFacture":28000,"montantPaye":28000,"status":"paid","isExterne":false,"source":"caisse","dateVente":"2026-08-01T09:15:00.000Z","datePaiement":"2026-08-01T11:45:00.000Z","paidAt":"2026-08-01T11:45:00.000Z","paidBy":"USR-CASH","paidByName":"Miora Kanto","createdAt":"2026-08-01T09:15:00.000Z","legacyInvoiceId":"inv-000001"}', 'pat-000001', 'consult-000001', 'FAC-2026-0003', 'pharmacie', 'societe', 'JIRAMA', 'paid', 28000, 28000, '2026-08-01T09:15:00.000Z', 'caisse', NULL
    UNION ALL SELECT 'vente-000004', '{"id":"vente-000004","patientId":"pat-000006","consultationId":"consult-000004","numeroFacture":"FAC-2026-0004","type":"pharmacie","clientType":"societe","clientName":"RASOLOFOMANANA Hery","company":"AIR MADAGASCAR","subtotal":49000,"remisePct":0,"remiseMontant":0,"montantFacture":49000,"montantPaye":49000,"status":"paid","isExterne":false,"source":"caisse","dateVente":"2026-08-01T08:45:00.000Z","datePaiement":"2026-08-01T09:30:00.000Z","paidAt":"2026-08-01T09:30:00.000Z","paidBy":"USR-CASH2","paidByName":"Pierre Duval","createdAt":"2026-08-01T08:45:00.000Z","legacyInvoiceId":"inv-000004"}', 'pat-000006', 'consult-000004', 'FAC-2026-0004', 'pharmacie', 'societe', 'AIR MADAGASCAR', 'paid', 49000, 49000, '2026-08-01T08:45:00.000Z', 'caisse', NULL
    UNION ALL SELECT 'vente-000005', '{"id":"vente-000005","patientId":"pat-000003","consultationId":"consult-000003","numeroFacture":"FAC-2026-0005","type":"consultation","clientType":"societe","clientName":"RANDRIANASOLO Voahirana","company":"TELMA","subtotal":10000,"remisePct":0,"remiseMontant":0,"montantFacture":10000,"montantPaye":0,"status":"pending","isExterne":false,"source":"caisse","dateVente":"2026-08-01T10:10:00.000Z","createdAt":"2026-08-01T10:10:00.000Z","legacyInvoiceId":"inv-000003"}', 'pat-000003', 'consult-000003', 'FAC-2026-0005', 'consultation', 'societe', 'TELMA', 'pending', 10000, 0, '2026-08-01T10:10:00.000Z', 'caisse', NULL
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `ventes`);

-- Exemples : lignes_vente (10 ligne(s))
INSERT INTO `lignes_vente` (`id`, `data_json`, `vente_id`, `article_id`, `article_name`, `quantity`, `unit_price`)
SELECT `id`, `data_json`, `vente_id`, `article_id`, `article_name`, `quantity`, `unit_price`
FROM (
    SELECT 'vline-000001' AS `id`, '{"id":"vline-000001","venteId":"vente-000001","articleName":"Consultation médicale","quantity":1,"unitPrice":10000,"discount":0,"category":"consultation","dateSort":"2026-07-29"}' AS `data_json`, 'vente-000001' AS `vente_id`, NULL AS `article_id`, 'Consultation médicale' AS `article_name`, 1 AS `quantity`, 10000 AS `unit_price`
    UNION ALL SELECT 'vline-000002', '{"id":"vline-000002","venteId":"vente-000001","articleName":"Glycémie à jeun","quantity":1,"unitPrice":8000,"discount":0,"category":"lab","dateSort":"2026-07-29"}', 'vente-000001', NULL, 'Glycémie à jeun', 1, 8000
    UNION ALL SELECT 'vline-000003', '{"id":"vline-000003","venteId":"vente-000002","articleName":"Consultation médicale","quantity":1,"unitPrice":10000,"discount":0,"category":"consultation","dateSort":"2026-07-30"}', 'vente-000002', NULL, 'Consultation médicale', 1, 10000
    UNION ALL SELECT 'vline-000004', '{"id":"vline-000004","venteId":"vente-000002","articleName":"Amoxicilline 1g × 14","articleId":"art-002","quantity":14,"unitPrice":2000,"discount":0,"category":"pharmacy","dateSort":"2026-07-30"}', 'vente-000002', 'art-002', 'Amoxicilline 1g × 14', 14, 2000
    UNION ALL SELECT 'vline-000005', '{"id":"vline-000005","venteId":"vente-000003","articleName":"Consultation médicale","quantity":1,"unitPrice":10000,"discount":0,"category":"consultation","dateSort":"2026-08-01"}', 'vente-000003', NULL, 'Consultation médicale', 1, 10000
    UNION ALL SELECT 'vline-000006', '{"id":"vline-000006","venteId":"vente-000003","articleName":"Paracétamol 500mg × 20","articleId":"art-001","quantity":20,"unitPrice":450,"discount":0,"category":"pharmacy","dateSort":"2026-08-01"}', 'vente-000003', 'art-001', 'Paracétamol 500mg × 20', 20, 450
    UNION ALL SELECT 'vline-000007', '{"id":"vline-000007","venteId":"vente-000003","articleName":"Goutte épaisse","quantity":1,"unitPrice":9000,"discount":0,"category":"lab","dateSort":"2026-08-01"}', 'vente-000003', NULL, 'Goutte épaisse', 1, 9000
    UNION ALL SELECT 'vline-000008', '{"id":"vline-000008","venteId":"vente-000004","articleName":"Consultation médicale","quantity":1,"unitPrice":10000,"discount":0,"category":"consultation","dateSort":"2026-08-01"}', 'vente-000004', NULL, 'Consultation médicale', 1, 10000
    UNION ALL SELECT 'vline-000009', '{"id":"vline-000009","venteId":"vente-000004","articleName":"Amlodipine 5mg × 30","articleId":"art-011","quantity":30,"unitPrice":1300,"discount":0,"category":"pharmacy","dateSort":"2026-08-01"}', 'vente-000004', 'art-011', 'Amlodipine 5mg × 30', 30, 1300
    UNION ALL SELECT 'vline-000010', '{"id":"vline-000010","venteId":"vente-000005","articleName":"Consultation médicale","quantity":1,"unitPrice":10000,"discount":0,"category":"consultation","dateSort":"2026-08-01"}', 'vente-000005', NULL, 'Consultation médicale', 1, 10000
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `lignes_vente`);

-- Exemples : paiements_vente (4 ligne(s))
INSERT INTO `paiements_vente` (`id`, `data_json`, `vente_id`, `amount`, `method`, `date`)
SELECT `id`, `data_json`, `vente_id`, `amount`, `method`, `date`
FROM (
    SELECT 'pay-000001' AS `id`, '{"id":"pay-000001","venteId":"vente-000001","amount":18000,"method":"Espèces","date":"2026-07-29T10:10:00.000Z","paidBy":"Miora Kanto","paidByUserId":"USR-CASH"}' AS `data_json`, 'vente-000001' AS `vente_id`, 18000 AS `amount`, 'Espèces' AS `method`, '2026-07-29T10:10:00.000Z' AS `date`
    UNION ALL SELECT 'pay-000002', '{"id":"pay-000002","venteId":"vente-000002","amount":38000,"method":"Espèces","date":"2026-07-30T15:00:00.000Z","paidBy":"Miora Kanto","paidByUserId":"USR-CASH"}', 'vente-000002', 38000, 'Espèces', '2026-07-30T15:00:00.000Z'
    UNION ALL SELECT 'pay-000003', '{"id":"pay-000003","venteId":"vente-000003","amount":28000,"method":"Autre","date":"2026-08-01T11:45:00.000Z","paidBy":"Miora Kanto","paidByUserId":"USR-CASH","reference":"Prise en charge JIRAMA"}', 'vente-000003', 28000, 'Autre', '2026-08-01T11:45:00.000Z'
    UNION ALL SELECT 'pay-000004', '{"id":"pay-000004","venteId":"vente-000004","amount":49000,"method":"Autre","date":"2026-08-01T09:30:00.000Z","paidBy":"Pierre Duval","paidByUserId":"USR-CASH2","reference":"Prise en charge AIR MADAGASCAR"}', 'vente-000004', 49000, 'Autre', '2026-08-01T09:30:00.000Z'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `paiements_vente`);

-- Exemples : articles (11 ligne(s))
INSERT INTO `articles` (`id`, `data_json`, `name`, `family`, `unit`, `stock_central`, `stock_pharmacie`, `barcode`)
SELECT `id`, `data_json`, `name`, `family`, `unit`, `stock_central`, `stock_pharmacie`, `barcode`
FROM (
    SELECT 'art-001' AS `id`, '{"id":"art-001","name":"Paracétamol 500mg","family":"MEDIC","unit":"comprimé","barcode":"619100000001","priceComptoir":500,"priceSociete":450,"priceExterne":600,"purchasePrice":200,"stockCentral":800,"stockPharmacie":120,"minStockCentral":100,"minStockPharmacie":50,"supplier":"MEDICIS IMPORT","expiryDate":"2028-12-31"}' AS `data_json`, 'Paracétamol 500mg' AS `name`, 'MEDIC' AS `family`, 'comprimé' AS `unit`, 800 AS `stock_central`, 120 AS `stock_pharmacie`, '619100000001' AS `barcode`
    UNION ALL SELECT 'art-002', '{"id":"art-002","name":"Amoxicilline 1g","family":"MEDIC","unit":"gélule","barcode":"619100000002","priceComptoir":2000,"priceSociete":1800,"priceExterne":2500,"purchasePrice":1000,"stockCentral":400,"stockPharmacie":45,"minStockCentral":50,"minStockPharmacie":30,"supplier":"PHARMA LABS S.A.","expiryDate":"2028-06-30"}', 'Amoxicilline 1g', 'MEDIC', 'gélule', 400, 45, '619100000002'
    UNION ALL SELECT 'art-003', '{"id":"art-003","name":"Ibuprofène 400mg","family":"MEDIC","unit":"comprimé","priceComptoir":800,"priceSociete":700,"priceExterne":1000,"purchasePrice":350,"stockCentral":600,"stockPharmacie":80,"minStockCentral":50,"minStockPharmacie":40}', 'Ibuprofène 400mg', 'MEDIC', 'comprimé', 600, 80, NULL
    UNION ALL SELECT 'art-004', '{"id":"art-004","name":"Oméprazole 20mg","family":"MEDIC","unit":"gélule","priceComptoir":1200,"priceSociete":1000,"priceExterne":1500,"purchasePrice":500,"stockCentral":300,"stockPharmacie":15,"minStockCentral":30,"minStockPharmacie":20}', 'Oméprazole 20mg', 'MEDIC', 'gélule', 300, 15, NULL
    UNION ALL SELECT 'art-005', '{"id":"art-005","name":"Metformine 850mg","family":"MEDIC","unit":"comprimé","priceComptoir":900,"priceSociete":800,"priceExterne":1100,"purchasePrice":400,"stockCentral":350,"stockPharmacie":60,"minStockCentral":30,"minStockPharmacie":25}', 'Metformine 850mg', 'MEDIC', 'comprimé', 350, 60, NULL
    UNION ALL SELECT 'art-006', '{"id":"art-006","name":"Tube EDTA","family":"LAB","unit":"unité","priceComptoir":300,"priceSociete":250,"priceExterne":400,"purchasePrice":100,"stockCentral":200,"stockPharmacie":50,"minStockCentral":30,"minStockPharmacie":20}', 'Tube EDTA', 'LAB', 'unité', 200, 50, NULL
    UNION ALL SELECT 'art-007', '{"id":"art-007","name":"Réactif Glycémie","family":"LAB","unit":"flacon","priceComptoir":5000,"priceSociete":4500,"priceExterne":6000,"purchasePrice":2500,"stockCentral":30,"stockPharmacie":10,"minStockCentral":5,"minStockPharmacie":3,"supplier":"DISPHAR LABO","expiryDate":"2027-03-31"}', 'Réactif Glycémie', 'LAB', 'flacon', 30, 10, NULL
    UNION ALL SELECT 'art-008', '{"id":"art-008","name":"Gel échographie","family":"ECHO","unit":"flacon","priceComptoir":5000,"priceSociete":4000,"priceExterne":6000,"purchasePrice":2000,"stockCentral":0,"stockPharmacie":4,"minStockCentral":5,"minStockPharmacie":2}', 'Gel échographie', 'ECHO', 'flacon', 0, 4, NULL
    UNION ALL SELECT 'art-009', '{"id":"art-009","name":"Composite dentaire","family":"DENT","unit":"seringue","priceComptoir":15000,"priceSociete":12000,"priceExterne":18000,"purchasePrice":8000,"stockCentral":15,"stockPharmacie":5,"minStockCentral":3,"minStockPharmacie":2}', 'Composite dentaire', 'DENT', 'seringue', 15, 5, NULL
    UNION ALL SELECT 'art-010', '{"id":"art-010","name":"Compresses stériles","family":"MEDIC","unit":"boîte","priceComptoir":1000,"priceSociete":900,"priceExterne":1200,"purchasePrice":400,"stockCentral":150,"stockPharmacie":30,"minStockCentral":20,"minStockPharmacie":10}', 'Compresses stériles', 'MEDIC', 'boîte', 150, 30, NULL
    UNION ALL SELECT 'art-011', '{"id":"art-011","name":"Amlodipine 5mg","family":"MEDIC","unit":"comprimé","priceComptoir":1500,"priceSociete":1300,"priceExterne":1800,"purchasePrice":700,"stockCentral":250,"stockPharmacie":40,"minStockCentral":20,"minStockPharmacie":15}', 'Amlodipine 5mg', 'MEDIC', 'comprimé', 250, 40, NULL
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `articles`);

-- Exemples : societes (4 ligne(s))
INSERT INTO `societes` (`id`, `data_json`, `name`, `settlement_mode`)
SELECT `id`, `data_json`, `name`, `settlement_mode`
FROM (
    SELECT 'cmp-jirama' AS `id`, '{"id":"cmp-jirama","name":"JIRAMA","paymentMode":"Crédit","settlementMode":"monthly_global","createdAt":"2026-01-05T08:00:00.000Z"}' AS `data_json`, 'JIRAMA' AS `name`, 'monthly_global' AS `settlement_mode`
    UNION ALL SELECT 'cmp-telma', '{"id":"cmp-telma","name":"TELMA","paymentMode":"Crédit","settlementMode":"monthly_global","createdAt":"2026-01-05T08:00:00.000Z"}', 'TELMA', 'monthly_global'
    UNION ALL SELECT 'cmp-airmad', '{"id":"cmp-airmad","name":"AIR MADAGASCAR","paymentMode":"Crédit","settlementMode":"per_invoice","createdAt":"2026-01-05T08:00:00.000Z"}', 'AIR MADAGASCAR', 'per_invoice'
    UNION ALL SELECT 'cmp-bni', '{"id":"cmp-bni","name":"BNI MADAGASCAR","paymentMode":"Crédit","settlementMode":"per_invoice","createdAt":"2026-01-05T08:00:00.000Z"}', 'BNI MADAGASCAR', 'per_invoice'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `societes`);

-- Exemples : comptes_facturation_societes (1 ligne(s))
INSERT INTO `comptes_facturation_societes` (`id`, `data_json`, `company`, `month`, `status`, `total_amount`, `paid_amount`)
SELECT `id`, `data_json`, `company`, `month`, `status`, `total_amount`, `paid_amount`
FROM (
    SELECT 'billing-000001' AS `id`, '{"id":"billing-000001","company":"JIRAMA","month":"2026-08","invoiceIds":["inv-000001"],"totalAmount":28000,"paidAmount":0,"status":"open","createdAt":"2026-08-01T12:00:00.000Z","payments":[]}' AS `data_json`, 'JIRAMA' AS `company`, '2026-08' AS `month`, 'open' AS `status`, 28000 AS `total_amount`, 0 AS `paid_amount`
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `comptes_facturation_societes`);

-- Exemples : fournisseurs (3 ligne(s))
INSERT INTO `fournisseurs` (`id`, `data_json`, `name`, `phone`)
SELECT `id`, `data_json`, `name`, `phone`
FROM (
    SELECT 'fourn-1' AS `id`, '{"id":"fourn-1","name":"PHARMA LABS S.A.","contactPerson":"M. Rabe","phone":"034 00 111 22","email":"contact@pharmalabs.mg","address":"Ankorondrano, Antananarivo","nif":"1000234567","stat":"51301 11 2018 0 00123","createdAt":"2026-01-05T08:00:00.000Z"}' AS `data_json`, 'PHARMA LABS S.A.' AS `name`, '034 00 111 22' AS `phone`
    UNION ALL SELECT 'fourn-2', '{"id":"fourn-2","name":"MEDICIS IMPORT","contactPerson":"Mme Razafy","phone":"033 11 222 33","email":"ventes@medicis.mg","address":"Ankorondrano, Antananarivo","nif":"1000345678","stat":"51301 11 2019 0 00456","createdAt":"2026-01-05T08:00:00.000Z"}', 'MEDICIS IMPORT', '033 11 222 33'
    UNION ALL SELECT 'fourn-3', '{"id":"fourn-3","name":"DISPHAR LABO","contactPerson":"M. Andry","phone":"034 44 555 66","email":"commande@disphar.mg","address":"Andraharo, Antananarivo","nif":"1000567890","stat":"51301 11 2021 0 00321","createdAt":"2026-01-05T08:00:00.000Z"}', 'DISPHAR LABO', '034 44 555 66'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `fournisseurs`);

-- Exemples : familles (4 ligne(s))
INSERT INTO `familles` (`id`, `data_json`, `code`, `name`, `color`)
SELECT `id`, `data_json`, `code`, `name`, `color`
FROM (
    SELECT 'fam-medic' AS `id`, '{"id":"fam-medic","code":"MEDIC","name":"Médicaments","color":"#0D47A1","order":1}' AS `data_json`, 'MEDIC' AS `code`, 'Médicaments' AS `name`, '#0D47A1' AS `color`
    UNION ALL SELECT 'fam-lab', '{"id":"fam-lab","code":"LAB","name":"Laboratoire","color":"#10B981","order":2}', 'LAB', 'Laboratoire', '#10B981'
    UNION ALL SELECT 'fam-echo', '{"id":"fam-echo","code":"ECHO","name":"Échographie","color":"#F59E0B","order":3}', 'ECHO', 'Échographie', '#F59E0B'
    UNION ALL SELECT 'fam-dent', '{"id":"fam-dent","code":"DENT","name":"Dentaire","color":"#8B5CF6","order":4}', 'DENT', 'Dentaire', '#8B5CF6'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `familles`);

-- Exemples : services_depot (5 ligne(s))
INSERT INTO `services_depot` (`id`, `data_json`, `code`, `name`, `kind`, `active`)
SELECT `id`, `data_json`, `code`, `name`, `kind`, `active`
FROM (
    SELECT 'svc-pharmacie' AS `id`, '{"id":"svc-pharmacie","code":"PHA","name":"Pharmacie","kind":"pharmacie","color":"purple","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}' AS `data_json`, 'PHA' AS `code`, 'Pharmacie' AS `name`, 'pharmacie' AS `kind`, 1 AS `active`
    UNION ALL SELECT 'svc-bloc', '{"id":"svc-bloc","code":"BLOC","name":"Bloc opératoire","kind":"service","color":"blue","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}', 'BLOC', 'Bloc opératoire', 'service', 1
    UNION ALL SELECT 'svc-soins', '{"id":"svc-soins","code":"SOINS","name":"Soins / Hospitalisation","kind":"service","color":"rose","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}', 'SOINS', 'Soins / Hospitalisation', 'service', 1
    UNION ALL SELECT 'svc-labo', '{"id":"svc-labo","code":"LABO","name":"Laboratoire","kind":"service","color":"emerald","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}', 'LABO', 'Laboratoire', 'service', 1
    UNION ALL SELECT 'svc-urgence', '{"id":"svc-urgence","code":"URG","name":"Urgences","kind":"service","color":"amber","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}', 'URG', 'Urgences', 'service', 1
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `services_depot`);

-- Exemples : catalogue_laboratoire (8 ligne(s))
INSERT INTO `catalogue_laboratoire` (`id`, `data_json`, `code`, `name`, `category`)
SELECT `id`, `data_json`, `code`, `name`, `category`
FROM (
    SELECT 'exam-001' AS `id`, '{"id":"exam-001","code":"LAB001","name":"NFS","category":"hematologie","parameters":["Globules Rouges","Globules Blancs","Hémoglobine","Plaquettes","Hématocrite"],"sampleType":"Sang veineux (EDTA)","priceComptoir":15000,"priceSociete":13000,"priceExterne":18000,"urgentPrice":25000,"durationHours":4}' AS `data_json`, 'LAB001' AS `code`, 'NFS' AS `name`, 'hematologie' AS `category`
    UNION ALL SELECT 'exam-002', '{"id":"exam-002","code":"LAB002","name":"Glycémie à jeun","category":"biochimie","parameters":["Glucose"],"sampleType":"Sang veineux","priceComptoir":8000,"priceSociete":7000,"priceExterne":10000,"urgentPrice":15000,"durationHours":1}', 'LAB002', 'Glycémie à jeun', 'biochimie'
    UNION ALL SELECT 'exam-003', '{"id":"exam-003","code":"LAB003","name":"Créatinine","category":"biochimie","parameters":["Créatinine"],"sampleType":"Sang veineux","priceComptoir":10000,"priceSociete":9000,"priceExterne":12000,"urgentPrice":18000,"durationHours":2}', 'LAB003', 'Créatinine', 'biochimie'
    UNION ALL SELECT 'exam-004', '{"id":"exam-004","code":"LAB004","name":"CRP","category":"biochimie","parameters":["CRP"],"sampleType":"Sang veineux","priceComptoir":7000,"priceSociete":6000,"priceExterne":9000,"urgentPrice":12000,"durationHours":1}', 'LAB004', 'CRP', 'biochimie'
    UNION ALL SELECT 'exam-005', '{"id":"exam-005","code":"LAB005","name":"Groupe Sanguin & Rhésus","category":"hematologie","parameters":["Groupe ABO","Rhésus"],"sampleType":"Sang veineux","priceComptoir":10000,"priceSociete":9000,"priceExterne":12000,"urgentPrice":15000,"durationHours":2}', 'LAB005', 'Groupe Sanguin & Rhésus', 'hematologie'
    UNION ALL SELECT 'exam-006', '{"id":"exam-006","code":"LAB006","name":"ECBU (Culture + Antibiogramme)","category":"bacteriologie","parameters":["Culture","Antibiogramme"],"sampleType":"Urine (pot stérile)","priceComptoir":15000,"priceSociete":13000,"priceExterne":18000,"urgentPrice":25000,"durationHours":48}', 'LAB006', 'ECBU (Culture + Antibiogramme)', 'bacteriologie'
    UNION ALL SELECT 'exam-007', '{"id":"exam-007","code":"LAB007","name":"Goutte épaisse","category":"parasitologie","parameters":["Plasmodium"],"sampleType":"Sang veineux","priceComptoir":10000,"priceSociete":9000,"priceExterne":12000,"urgentPrice":18000,"durationHours":4}', 'LAB007', 'Goutte épaisse', 'parasitologie'
    UNION ALL SELECT 'exam-008', '{"id":"exam-008","code":"LAB008","name":"TP / INR","category":"hemostase","parameters":["TP","INR"],"sampleType":"Sang veineux (citraté)","priceComptoir":12000,"priceSociete":11000,"priceExterne":15000,"urgentPrice":20000,"durationHours":2}', 'LAB008', 'TP / INR', 'hemostase'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `catalogue_laboratoire`);

-- Exemples : demandes_laboratoire (2 ligne(s))
INSERT INTO `demandes_laboratoire` (`id`, `data_json`, `patient_id`, `consultation_id`, `exam_type`, `status`, `urgent`, `requested_at`)
SELECT `id`, `data_json`, `patient_id`, `consultation_id`, `exam_type`, `status`, `urgent`, `requested_at`
FROM (
    SELECT 'labreq-000001' AS `id`, '{"id":"labreq-000001","patientId":"pat-000001","consultationId":"consult-000001","examType":"Goutte épaisse","code":"LAB007","category":"parasitologie","parameters":["Plasmodium"],"urgent":false,"status":"completed","sampleType":"Sang veineux","sampleReceived":true,"sampleReceivedAt":"2026-08-01T09:20:00.000Z","requestedBy":"USR-DOC","requestedAt":"2026-08-01T09:12:00.000Z","invoiceId":"inv-000001","price":9000,"results":[{"parameter":"Plasmodium","value":"Positif (P. falciparum)","isAbnormal":true,"comments":"Densité parasitaire faible"}],"completedAt":"2026-08-01T11:30:00.000Z","completedBy":"USR-LAB"}' AS `data_json`, 'pat-000001' AS `patient_id`, 'consult-000001' AS `consultation_id`, 'Goutte épaisse' AS `exam_type`, 'completed' AS `status`, 0 AS `urgent`, '2026-08-01T09:12:00.000Z' AS `requested_at`
    UNION ALL SELECT 'labreq-000002', '{"id":"labreq-000002","patientId":"pat-000005","consultationId":"consult-000005","examType":"Glycémie à jeun","code":"LAB002","category":"biochimie","parameters":["Glucose"],"urgent":false,"status":"completed","sampleType":"Sang veineux","sampleReceived":true,"sampleReceivedAt":"2026-07-29T10:00:00.000Z","requestedBy":"USR-DOC","requestedAt":"2026-07-29T09:50:00.000Z","invoiceId":"inv-000005","price":8000,"results":[{"parameter":"Glucose","value":1.05,"unit":"g/L","normalMin":0.7,"normalMax":1.1,"isAbnormal":false}],"completedAt":"2026-07-29T11:00:00.000Z","completedBy":"USR-LAB"}', 'pat-000005', 'consult-000005', 'Glycémie à jeun', 'completed', 0, '2026-07-29T09:50:00.000Z'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `demandes_laboratoire`);

-- Exemples : parcours_patient (12 ligne(s))
INSERT INTO `parcours_patient` (`id`, `data_json`, `patient_id`, `timestamp`, `department`, `action`)
SELECT `id`, `data_json`, `patient_id`, `timestamp`, `department`, `action`
FROM (
    SELECT 'journey-000001' AS `id`, '{"id":"journey-000001","patientId":"pat-000001","timestamp":"2026-07-15T08:30:00.000Z","department":"reception","action":"Enregistrement patient","status":"registered","actorName":"Aina Rakoto"}' AS `data_json`, 'pat-000001' AS `patient_id`, '2026-07-15T08:30:00.000Z' AS `timestamp`, 'reception' AS `department`, 'Enregistrement patient' AS `action`
    UNION ALL SELECT 'journey-000002', '{"id":"journey-000002","patientId":"pat-000001","timestamp":"2026-08-01T09:12:00.000Z","department":"consultation","action":"Consultation terminée","status":"invoice_paid","details":"Paludisme simple — ordonnance payée","actorName":"Dr. Feno Rasoana","consultationId":"consult-000001","invoiceId":"inv-000001"}', 'pat-000001', '2026-08-01T09:12:00.000Z', 'consultation', 'Consultation terminée'
    UNION ALL SELECT 'journey-000003', '{"id":"journey-000003","patientId":"pat-000001","timestamp":"2026-08-01T11:50:00.000Z","department":"pharmacie","action":"Ordonnance délivrée","status":"medications_delivered","details":"Paracétamol 500mg × 20","actorName":"Tiana Soa","consultationId":"consult-000001"}', 'pat-000001', '2026-08-01T11:50:00.000Z', 'pharmacie', 'Ordonnance délivrée'
    UNION ALL SELECT 'journey-000004', '{"id":"journey-000004","patientId":"pat-000002","timestamp":"2026-07-20T09:00:00.000Z","department":"reception","action":"Enregistrement patient","status":"registered","actorName":"Aina Rakoto"}', 'pat-000002', '2026-07-20T09:00:00.000Z', 'reception', 'Enregistrement patient'
    UNION ALL SELECT 'journey-000005', '{"id":"journey-000005","patientId":"pat-000002","timestamp":"2026-07-30T14:20:00.000Z","department":"consultation","action":"Consultation terminée","status":"medications_delivered","details":"Bronchite aiguë — Amoxicilline délivrée","actorName":"Dr. Mialy Andria","consultationId":"consult-000002","invoiceId":"inv-000002"}', 'pat-000002', '2026-07-30T14:20:00.000Z', 'consultation', 'Consultation terminée'
    UNION ALL SELECT 'journey-000006', '{"id":"journey-000006","patientId":"pat-000003","timestamp":"2026-08-01T07:45:00.000Z","department":"reception","action":"Enregistrement patient","status":"registered","actorName":"Aina Rakoto"}', 'pat-000003', '2026-08-01T07:45:00.000Z', 'reception', 'Enregistrement patient'
    UNION ALL SELECT 'journey-000007', '{"id":"journey-000007","patientId":"pat-000003","timestamp":"2026-08-01T10:05:00.000Z","department":"consultation","action":"Consultation terminée","status":"consulted_awaiting_payment","details":"En attente de règlement à la caisse (FAC-2026-0005)","actorName":"Dr. Feno Rasoana","consultationId":"consult-000003","invoiceId":"inv-000003"}', 'pat-000003', '2026-08-01T10:05:00.000Z', 'consultation', 'Consultation terminée'
    UNION ALL SELECT 'journey-000008', '{"id":"journey-000008","patientId":"pat-000004","timestamp":"2026-08-02T06:30:00.000Z","department":"reception","action":"Admis en consultation","status":"waiting_consultation","details":"Constantes prises — file Médecine Générale","actorName":"Aina Rakoto"}', 'pat-000004', '2026-08-02T06:30:00.000Z', 'reception', 'Admis en consultation'
    UNION ALL SELECT 'journey-000009', '{"id":"journey-000009","patientId":"pat-000005","timestamp":"2026-07-29T09:50:00.000Z","department":"consultation","action":"Consultation terminée","status":"analyses_pending","details":"Glycémie à jeun demandée","actorName":"Dr. Feno Rasoana","consultationId":"consult-000005","invoiceId":"inv-000005","labRequestId":"labreq-000002"}', 'pat-000005', '2026-07-29T09:50:00.000Z', 'consultation', 'Consultation terminée'
    UNION ALL SELECT 'journey-000010', '{"id":"journey-000010","patientId":"pat-000005","timestamp":"2026-07-29T11:00:00.000Z","department":"laboratoire","action":"Résultats validés","status":"analyses_complete","details":"Glucose 1.05 g/L — normal","actorName":"Hery Lanto","labRequestId":"labreq-000002"}', 'pat-000005', '2026-07-29T11:00:00.000Z', 'laboratoire', 'Résultats validés'
    UNION ALL SELECT 'journey-000011', '{"id":"journey-000011","patientId":"pat-000006","timestamp":"2026-08-01T08:40:00.000Z","department":"consultation","action":"Consultation terminée","status":"invoice_paid","details":"Facture réglée — ordonnance à délivrer en pharmacie","actorName":"Dr. Mialy Andria","consultationId":"consult-000004","invoiceId":"inv-000004"}', 'pat-000006', '2026-08-01T08:40:00.000Z', 'consultation', 'Consultation terminée'
    UNION ALL SELECT 'journey-000012', '{"id":"journey-000012","patientId":"pat-000007","timestamp":"2026-08-02T07:05:00.000Z","department":"reception","action":"Enregistrement patient","status":"registered","actorName":"Aina Rakoto"}', 'pat-000007', '2026-08-02T07:05:00.000Z', 'reception', 'Enregistrement patient'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `parcours_patient`);

-- Exemples : notifications (2 ligne(s))
INSERT INTO `notifications` (`id`, `data_json`, `target_role`, `type`, `timestamp`, `read_flag`)
SELECT `id`, `data_json`, `target_role`, `type`, `timestamp`, `read_flag`
FROM (
    SELECT 'notif-000001' AS `id`, '{"id":"notif-000001","targetRole":"magasinier","message":"🚨 Rupture de stock central : Gel échographie (0 / alerte : 5)","type":"critical","timestamp":"2026-08-01T07:00:00.000Z","read":false}' AS `data_json`, 'magasinier' AS `target_role`, 'critical' AS `type`, '2026-08-01T07:00:00.000Z' AS `timestamp`, 0 AS `read_flag`
    UNION ALL SELECT 'notif-000002', '{"id":"notif-000002","targetRole":"pharmacy","message":"⚠️ Stock bas pharmacie : Oméprazole 20mg (15 / alerte : 20)","type":"warning","timestamp":"2026-08-01T16:30:00.000Z","read":false}', 'pharmacy', 'warning', '2026-08-01T16:30:00.000Z', 0
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `notifications`);

-- Exemples : messages (2 ligne(s))
INSERT INTO `messages` (`id`, `data_json`, `from_user_id`, `to_user_id`, `timestamp`, `read_flag`)
SELECT `id`, `data_json`, `from_user_id`, `to_user_id`, `timestamp`, `read_flag`
FROM (
    SELECT 'msg-000001' AS `id`, '{"id":"msg-000001","fromUserId":"USR-REC","fromUserName":"Aina Rakoto","toUserId":"USR-DOC","toUserName":"Dr. Feno Rasoana","content":"Bonjour Docteur, un patient est en file d''attente en Médecine Générale (MBOLA Tiana).","timestamp":"2026-08-02T06:35:00.000Z","read":false}' AS `data_json`, 'USR-REC' AS `from_user_id`, 'USR-DOC' AS `to_user_id`, '2026-08-02T06:35:00.000Z' AS `timestamp`, 0 AS `read_flag`
    UNION ALL SELECT 'msg-000002', '{"id":"msg-000002","fromUserId":"USR-PHA","fromUserName":"Tiana Soa","toUserId":"USR-MAG","toUserName":"Niry Tahina","content":"Merci de prévoir un réapprovisionnement en gel échographie : rupture au dépôt central.","timestamp":"2026-08-01T13:00:00.000Z","read":false}', 'USR-PHA', 'USR-MAG', '2026-08-01T13:00:00.000Z', 0
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `messages`);

-- Exemples : transferts_stock (2 ligne(s))
INSERT INTO `transferts_stock` (`id`, `data_json`, `article_id`, `quantity`, `status`, `target_service_id`, `requested_at`)
SELECT `id`, `data_json`, `article_id`, `quantity`, `status`, `target_service_id`, `requested_at`
FROM (
    SELECT 'transfert-000001' AS `id`, '{"id":"transfert-000001","articleId":"art-001","articleName":"Paracétamol 500mg","quantity":60,"category":"approvisionnement","targetServiceId":"svc-pharmacie","targetServiceName":"Pharmacie","status":"transferred","requestedBy":"USR-PHA","requestedAt":"2026-07-25T08:00:00.000Z","transferredBy":"USR-MAG","transferredAt":"2026-07-25T09:30:00.000Z","requestSource":"pharmacy"}' AS `data_json`, 'art-001' AS `article_id`, 60 AS `quantity`, 'transferred' AS `status`, 'svc-pharmacie' AS `target_service_id`, '2026-07-25T08:00:00.000Z' AS `requested_at`
    UNION ALL SELECT 'transfert-000002', '{"id":"transfert-000002","articleId":"art-006","articleName":"Tube EDTA","quantity":30,"category":"approvisionnement","targetServiceId":"svc-labo","targetServiceName":"Laboratoire","status":"transferred","requestedBy":"USR-MAG","requestedAt":"2026-07-28T08:30:00.000Z","transferredBy":"USR-MAG","transferredAt":"2026-07-28T09:00:00.000Z","requestSource":"magasinier"}', 'art-006', 30, 'transferred', 'svc-labo', '2026-07-28T08:30:00.000Z'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `transferts_stock`);

-- Exemples : entrees_stock (3 ligne(s))
INSERT INTO `entrees_stock` (`id`, `data_json`, `article_id`, `quantity`, `supplier`, `date`)
SELECT `id`, `data_json`, `article_id`, `quantity`, `supplier`, `date`
FROM (
    SELECT 'entry-000001' AS `id`, '{"id":"entry-000001","articleId":"art-002","articleName":"Amoxicilline 1g","quantity":200,"purchasePrice":1000,"supplier":"PHARMA LABS S.A.","invoiceRef":"BL-2026-00042","expiryDate":"2028-06-30","date":"2026-07-12T08:30:00.000Z","enteredBy":"Niry Tahina","destination":"central"}' AS `data_json`, 'art-002' AS `article_id`, 200 AS `quantity`, 'PHARMA LABS S.A.' AS `supplier`, '2026-07-12T08:30:00.000Z' AS `date`
    UNION ALL SELECT 'entry-000002', '{"id":"entry-000002","articleId":"art-001","articleName":"Paracétamol 500mg","quantity":500,"purchasePrice":200,"supplier":"MEDICIS IMPORT","invoiceRef":"BL-2026-00055","expiryDate":"2028-12-31","date":"2026-07-18T09:00:00.000Z","enteredBy":"Niry Tahina","destination":"central"}', 'art-001', 500, 'MEDICIS IMPORT', '2026-07-18T09:00:00.000Z'
    UNION ALL SELECT 'entry-000003', '{"id":"entry-000003","articleId":"art-007","articleName":"Réactif Glycémie","quantity":20,"purchasePrice":2500,"supplier":"DISPHAR LABO","invoiceRef":"BL-2026-00061","expiryDate":"2027-03-31","date":"2026-07-24T10:00:00.000Z","enteredBy":"Niry Tahina","destination":"central"}', 'art-007', 20, 'DISPHAR LABO', '2026-07-24T10:00:00.000Z'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `entrees_stock`);

-- Exemples : mouvements_stock (5 ligne(s))
INSERT INTO `mouvements_stock` (`id`, `data_json`, `type`, `article_id`, `quantity`, `date`, `from_location`, `to_location`)
SELECT `id`, `data_json`, `type`, `article_id`, `quantity`, `date`, `from_location`, `to_location`
FROM (
    SELECT 'stockmove-000001' AS `id`, '{"id":"stockmove-000001","type":"entry","articleId":"art-002","articleName":"Amoxicilline 1g","quantity":200,"fromLocation":"supplier","toLocation":"central","ref":"BL-2026-00042","date":"2026-07-12T08:30:00.000Z","userId":"USR-MAG","userName":"Niry Tahina"}' AS `data_json`, 'entry' AS `type`, 'art-002' AS `article_id`, 200 AS `quantity`, '2026-07-12T08:30:00.000Z' AS `date`, 'supplier' AS `from_location`, 'central' AS `to_location`
    UNION ALL SELECT 'stockmove-000002', '{"id":"stockmove-000002","type":"entry","articleId":"art-001","articleName":"Paracétamol 500mg","quantity":500,"fromLocation":"supplier","toLocation":"central","ref":"BL-2026-00055","date":"2026-07-18T09:00:00.000Z","userId":"USR-MAG","userName":"Niry Tahina"}', 'entry', 'art-001', 500, '2026-07-18T09:00:00.000Z', 'supplier', 'central'
    UNION ALL SELECT 'stockmove-000003', '{"id":"stockmove-000003","type":"entry","articleId":"art-007","articleName":"Réactif Glycémie","quantity":20,"fromLocation":"supplier","toLocation":"central","ref":"BL-2026-00061","date":"2026-07-24T10:00:00.000Z","userId":"USR-MAG","userName":"Niry Tahina"}', 'entry', 'art-007', 20, '2026-07-24T10:00:00.000Z', 'supplier', 'central'
    UNION ALL SELECT 'stockmove-000004', '{"id":"stockmove-000004","type":"transfer","articleId":"art-001","articleName":"Paracétamol 500mg","quantity":60,"fromLocation":"central","toLocation":"svc-pharmacie","ref":"TR-0001","date":"2026-07-25T09:30:00.000Z","userId":"USR-MAG","userName":"Niry Tahina"}', 'transfer', 'art-001', 60, '2026-07-25T09:30:00.000Z', 'central', 'svc-pharmacie'
    UNION ALL SELECT 'stockmove-000005', '{"id":"stockmove-000005","type":"transfer","articleId":"art-006","articleName":"Tube EDTA","quantity":30,"fromLocation":"central","toLocation":"svc-labo","ref":"TR-0002","date":"2026-07-28T09:00:00.000Z","userId":"USR-MAG","userName":"Niry Tahina"}', 'transfer', 'art-006', 30, '2026-07-28T09:00:00.000Z', 'central', 'svc-labo'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `mouvements_stock`);

-- Exemples : entetes_mouvements (5 ligne(s))
INSERT INTO `entetes_mouvements` (`id`, `data_json`, `type`, `ref`, `date`, `user_id`)
SELECT `id`, `data_json`, `type`, `ref`, `date`, `user_id`
FROM (
    SELECT 'mv-000001' AS `id`, '{"id":"mv-000001","type":"achat","ref":"BL-2026-00042","date":"2026-07-12T08:30:00.000Z","userId":"USR-MAG","userName":"Niry Tahina","toLocation":"central","totalQuantity":200,"status":"completed"}' AS `data_json`, 'achat' AS `type`, 'BL-2026-00042' AS `ref`, '2026-07-12T08:30:00.000Z' AS `date`, 'USR-MAG' AS `user_id`
    UNION ALL SELECT 'mv-000002', '{"id":"mv-000002","type":"achat","ref":"BL-2026-00055","date":"2026-07-18T09:00:00.000Z","userId":"USR-MAG","userName":"Niry Tahina","toLocation":"central","totalQuantity":500,"status":"completed"}', 'achat', 'BL-2026-00055', '2026-07-18T09:00:00.000Z', 'USR-MAG'
    UNION ALL SELECT 'mv-000003', '{"id":"mv-000003","type":"achat","ref":"BL-2026-00061","date":"2026-07-24T10:00:00.000Z","userId":"USR-MAG","userName":"Niry Tahina","toLocation":"central","totalQuantity":20,"status":"completed"}', 'achat', 'BL-2026-00061', '2026-07-24T10:00:00.000Z', 'USR-MAG'
    UNION ALL SELECT 'mv-000004', '{"id":"mv-000004","type":"transfert","ref":"TR-0001","date":"2026-07-25T09:30:00.000Z","userId":"USR-MAG","userName":"Niry Tahina","fromLocation":"central","toLocation":"svc-pharmacie","totalQuantity":60,"status":"completed"}', 'transfert', 'TR-0001', '2026-07-25T09:30:00.000Z', 'USR-MAG'
    UNION ALL SELECT 'mv-000005', '{"id":"mv-000005","type":"transfert","ref":"TR-0002","date":"2026-07-28T09:00:00.000Z","userId":"USR-MAG","userName":"Niry Tahina","fromLocation":"central","toLocation":"svc-labo","totalQuantity":30,"status":"completed"}', 'transfert', 'TR-0002', '2026-07-28T09:00:00.000Z', 'USR-MAG'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `entetes_mouvements`);

-- Exemples : lignes_mouvements (5 ligne(s))
INSERT INTO `lignes_mouvements` (`id`, `data_json`, `movement_id`, `article_id`, `article_name`, `quantity`)
SELECT `id`, `data_json`, `movement_id`, `article_id`, `article_name`, `quantity`
FROM (
    SELECT 'mvline-000001' AS `id`, '{"id":"mvline-000001","movementId":"mv-000001","articleId":"art-002","articleName":"Amoxicilline 1g","quantity":200,"purchasePrice":1000}' AS `data_json`, 'mv-000001' AS `movement_id`, 'art-002' AS `article_id`, 'Amoxicilline 1g' AS `article_name`, 200 AS `quantity`
    UNION ALL SELECT 'mvline-000002', '{"id":"mvline-000002","movementId":"mv-000002","articleId":"art-001","articleName":"Paracétamol 500mg","quantity":500,"purchasePrice":200}', 'mv-000002', 'art-001', 'Paracétamol 500mg', 500
    UNION ALL SELECT 'mvline-000003', '{"id":"mvline-000003","movementId":"mv-000003","articleId":"art-007","articleName":"Réactif Glycémie","quantity":20,"purchasePrice":2500}', 'mv-000003', 'art-007', 'Réactif Glycémie', 20
    UNION ALL SELECT 'mvline-000004', '{"id":"mvline-000004","movementId":"mv-000004","articleId":"art-001","articleName":"Paracétamol 500mg","quantity":60}', 'mv-000004', 'art-001', 'Paracétamol 500mg', 60
    UNION ALL SELECT 'mvline-000005', '{"id":"mvline-000005","movementId":"mv-000005","articleId":"art-006","articleName":"Tube EDTA","quantity":30}', 'mv-000005', 'art-006', 'Tube EDTA', 30
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `lignes_mouvements`);

-- Exemples : lignes_livraison_pharmacie (2 ligne(s))
INSERT INTO `lignes_livraison_pharmacie` (`id`, `data_json`, `consultation_id`, `patient_id`, `article_name`, `quantity`, `delivered_at`)
SELECT `id`, `data_json`, `consultation_id`, `patient_id`, `article_name`, `quantity`, `delivered_at`
FROM (
    SELECT 'deliv-000001' AS `id`, '{"id":"deliv-000001","consultationId":"consult-000001","patientId":"pat-000001","patientName":"RAHARISON Marie","doctorName":"Dr. Feno Rasoana","articleId":"art-001","articleName":"Paracétamol 500mg","quantity":20,"unitPrice":450,"posology":"1 cp matin, midi et soir","deliveredAt":"2026-08-01T11:50:00.000Z","deliveredByUserId":"USR-PHA","deliveredByName":"Tiana Soa"}' AS `data_json`, 'consult-000001' AS `consultation_id`, 'pat-000001' AS `patient_id`, 'Paracétamol 500mg' AS `article_name`, 20 AS `quantity`, '2026-08-01T11:50:00.000Z' AS `delivered_at`
    UNION ALL SELECT 'deliv-000002', '{"id":"deliv-000002","consultationId":"consult-000002","patientId":"pat-000002","patientName":"RAKOTO Solo","doctorName":"Dr. Mialy Andria","articleId":"art-002","articleName":"Amoxicilline 1g","quantity":14,"unitPrice":2000,"posology":"1 gélule matin et soir","deliveredAt":"2026-07-30T15:05:00.000Z","deliveredByUserId":"USR-PHA2","deliveredByName":"Fatima Benali"}', 'consult-000002', 'pat-000002', 'Amoxicilline 1g', 14, '2026-07-30T15:05:00.000Z'
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `lignes_livraison_pharmacie`);

-- Exemples : dossiers_hospitalisation_bloc (1 ligne(s))
INSERT INTO `dossiers_hospitalisation_bloc` (`id`, `data_json`, `patient_id`, `patient_name`, `type`, `client_type`, `opened_at`)
SELECT `id`, `data_json`, `patient_id`, `patient_name`, `type`, `client_type`, `opened_at`
FROM (
    SELECT 'hb-000001' AS `id`, '{"id":"hb-000001","patientId":"pat-000006","patientName":"RASOLOFOMANANA Hery","clientType":"societe","company":"AIR MADAGASCAR","type":"hospit","lines":[{"id":"hbline-000001","articleName":"Séjour hospitalier (chambre)","quantity":1,"unitPrice":65000,"discount":0,"dateSort":"2026-07-22"}],"payments":[{"amount":30000,"paidBy":"Miora Kanto","date":"2026-07-22T14:00:00.000Z","paidByUserId":"USR-CASH","receivedBy":"caisse"}],"openedAt":"2026-07-22T10:00:00.000Z","openedBy":"Miora Kanto","openedByUserId":"USR-CASH"}' AS `data_json`, 'pat-000006' AS `patient_id`, 'RASOLOFOMANANA Hery' AS `patient_name`, 'hospit' AS `type`, 'societe' AS `client_type`, '2026-07-22T10:00:00.000Z' AS `opened_at`
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `dossiers_hospitalisation_bloc`);

-- Exemples : compteurs (2 lignes)
INSERT INTO `compteurs` (`id`, `value`)
SELECT `id`, `value`
FROM (
    SELECT 'factureCounter' AS `id`, 5 AS `value`
    UNION ALL SELECT 'pharmaClosingCounter', 0
) AS `donnees_exemples`
WHERE NOT EXISTS (SELECT 1 FROM `compteurs`);
