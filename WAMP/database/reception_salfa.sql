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
--  Identification de la société / de l'hôpital exploitant
--  (raison sociale, identifiants fiscaux, agrément sanitaire, coordonnées,
--   représentant légal et coordonnées bancaires).
--  La ligne marquée `is_principal = 1` alimente l'en-tête des documents.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `etablissements` (
  `id`              VARCHAR(64)  NOT NULL,
  `code`            VARCHAR(32)  DEFAULT NULL,
  `name`            VARCHAR(255) DEFAULT NULL,
  `trade_name`      VARCHAR(255) DEFAULT NULL,
  `type`            VARCHAR(32)  DEFAULT NULL,
  `nif`             VARCHAR(64)  DEFAULT NULL,
  `stat`            VARCHAR(64)  DEFAULT NULL,
  `numero_agrement` VARCHAR(64)  DEFAULT NULL,
  `city`            VARCHAR(128) DEFAULT NULL,
  `phone`           VARCHAR(64)  DEFAULT NULL,
  `email`           VARCHAR(191) DEFAULT NULL,
  `active`          TINYINT(1)   NOT NULL DEFAULT 1,
  `is_principal`    TINYINT(1)   NOT NULL DEFAULT 0,
  `data_json`       LONGTEXT     NOT NULL,
  `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_etablissements_code` (`code`),
  KEY `idx_etablissements_principal` (`is_principal`)
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
--  Grille tarifaire d'un article : 1 prix d'achat + 3 prix de vente
--  (comptoir / société / externe) — cf. interface Article (types.ts).
CREATE TABLE IF NOT EXISTS `articles` (
  `id`            VARCHAR(64) NOT NULL,
  `name`          VARCHAR(255) DEFAULT NULL,
  `family`        VARCHAR(8)   DEFAULT NULL,
  `unit`          VARCHAR(32)  DEFAULT NULL,
  `prix_achat`    DECIMAL(15,2) NOT NULL DEFAULT 0,
  `prix_comptoir` DECIMAL(15,2) NOT NULL DEFAULT 0,
  `prix_societe`  DECIMAL(15,2) NOT NULL DEFAULT 0,
  `prix_externe`  DECIMAL(15,2) NOT NULL DEFAULT 0,
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

-- ============================================================================
--  Configuration minimale du système
-- ============================================================================
--  AUCUNE donnée de démonstration JSON n'est insérée : cette section contient
--  uniquement la configuration indispensable au fonctionnement de l'application
--  (comptes de connexion, paramètres d'impression, familles d'articles,
--  services du dépôt et compteurs séquentiels). Les comptes permettent la
--  première connexion ; les paramètres et familles sont ensuite modifiables
--  depuis l'application.
--
--  Les lignes ne sont insérées que lorsque la table est vide : un nouvel import
--  du schéma ne remplace donc jamais des données déjà saisies dans MySQL.
-- ============================================================================

SET NAMES utf8mb4;

-- Configuration : parametres_impression (1 ligne, id = 'default')
INSERT INTO `parametres_impression` (`id`, `data_json`, `facility_name`, `currency`)
SELECT `id`, `data_json`, `facility_name`, `currency`
FROM (
    SELECT 'default' AS `id`, '{"facilityName":"SALFA — Centre de Santé","address":"Antananarivo, Madagascar","phone":"","nif":"","logoUrl":"","secondLogoUrl":"","receiptTitle":"REÇU DE PAIEMENT","footerMessage":"Merci de votre visite. Prompt rétablissement !","paperWidth":80,"autoPrint":true,"showLogo":true,"showBarcode":true,"showSignature":true,"copies":1,"currency":"Ar","paymentMethods":["Espèces","Carte bancaire","Mobile Money","Virement","Chèque"],"invoicePrefix":"FAC","id":"default"}' AS `data_json`, 'SALFA — Centre de Santé' AS `facility_name`, 'Ar' AS `currency`
) AS `config_minimale`
WHERE NOT EXISTS (SELECT 1 FROM `parametres_impression`);

-- Configuration : etablissements (identification société / hôpital — 1 ligne principale)
INSERT INTO `etablissements` (`id`, `data_json`, `code`, `name`, `trade_name`, `type`, `nif`, `stat`, `numero_agrement`, `city`, `phone`, `email`, `active`, `is_principal`)
SELECT `id`, `data_json`, `code`, `name`, `trade_name`, `type`, `nif`, `stat`, `numero_agrement`, `city`, `phone`, `email`, `active`, `is_principal`
FROM (
    SELECT 'etb-principal' AS `id`,
           '{"id":"etb-principal","code":"ETB-001","name":"SALFA — Centre de Santé","tradeName":"SALFA — Centre de Santé","type":"centre_sante","legalForm":"","nif":"","stat":"","rcs":"","numeroAgrement":"","numeroCnaps":"","capital":"","address":"Antananarivo, Madagascar","city":"Antananarivo","postalCode":"","region":"","country":"Madagascar","phone":"","phone2":"","fax":"","email":"","website":"","directorName":"","directorTitle":"Directeur","directorPhone":"","bankName":"","bankAccount":"","logoUrl":"","notes":"","active":true,"isPrincipal":true}' AS `data_json`,
           'ETB-001' AS `code`, 'SALFA — Centre de Santé' AS `name`, 'SALFA — Centre de Santé' AS `trade_name`,
           'centre_sante' AS `type`, '' AS `nif`, '' AS `stat`, '' AS `numero_agrement`,
           'Antananarivo' AS `city`, '' AS `phone`, '' AS `email`, 1 AS `active`, 1 AS `is_principal`
) AS `config_minimale`
WHERE NOT EXISTS (SELECT 1 FROM `etablissements`);

-- Configuration : utilisateurs / comptes de connexion (11 comptes)
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
) AS `config_minimale`
WHERE NOT EXISTS (SELECT 1 FROM `utilisateurs`);

-- Configuration : familles d'articles (4 familles par défaut)
INSERT INTO `familles` (`id`, `data_json`, `code`, `name`, `color`)
SELECT `id`, `data_json`, `code`, `name`, `color`
FROM (
    SELECT 'fam-medic' AS `id`, '{"id":"fam-medic","code":"MEDIC","name":"Médicaments","color":"#0D47A1","order":1}' AS `data_json`, 'MEDIC' AS `code`, 'Médicaments' AS `name`, '#0D47A1' AS `color`
    UNION ALL SELECT 'fam-lab', '{"id":"fam-lab","code":"LAB","name":"Laboratoire","color":"#10B981","order":2}', 'LAB', 'Laboratoire', '#10B981'
    UNION ALL SELECT 'fam-echo', '{"id":"fam-echo","code":"ECHO","name":"Échographie","color":"#F59E0B","order":3}', 'ECHO', 'Échographie', '#F59E0B'
    UNION ALL SELECT 'fam-dent', '{"id":"fam-dent","code":"DENT","name":"Dentaire","color":"#8B5CF6","order":4}', 'DENT', 'Dentaire', '#8B5CF6'
) AS `config_minimale`
WHERE NOT EXISTS (SELECT 1 FROM `familles`);

-- Configuration : services destinataires du dépôt (5 services)
INSERT INTO `services_depot` (`id`, `data_json`, `code`, `name`, `kind`, `active`)
SELECT `id`, `data_json`, `code`, `name`, `kind`, `active`
FROM (
    SELECT 'svc-pharmacie' AS `id`, '{"id":"svc-pharmacie","code":"PHA","name":"Pharmacie","kind":"pharmacie","color":"purple","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}' AS `data_json`, 'PHA' AS `code`, 'Pharmacie' AS `name`, 'pharmacie' AS `kind`, 1 AS `active`
    UNION ALL SELECT 'svc-bloc', '{"id":"svc-bloc","code":"BLOC","name":"Bloc opératoire","kind":"service","color":"blue","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}', 'BLOC', 'Bloc opératoire', 'service', 1
    UNION ALL SELECT 'svc-soins', '{"id":"svc-soins","code":"SOINS","name":"Soins / Hospitalisation","kind":"service","color":"rose","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}', 'SOINS', 'Soins / Hospitalisation', 'service', 1
    UNION ALL SELECT 'svc-labo', '{"id":"svc-labo","code":"LABO","name":"Laboratoire","kind":"service","color":"emerald","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}', 'LABO', 'Laboratoire', 'service', 1
    UNION ALL SELECT 'svc-urgence', '{"id":"svc-urgence","code":"URG","name":"Urgences","kind":"service","color":"amber","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}', 'URG', 'Urgences', 'service', 1
) AS `config_minimale`
WHERE NOT EXISTS (SELECT 1 FROM `services_depot`);

-- Configuration : compteurs séquentiels (départ à 0 : aucune donnée préchargée)
INSERT INTO `compteurs` (`id`, `value`)
SELECT `id`, `value`
FROM (
    SELECT 'factureCounter' AS `id`, 0 AS `value`
    UNION ALL SELECT 'pharmaClosingCounter', 0
) AS `config_minimale`
WHERE NOT EXISTS (SELECT 1 FROM `compteurs`);
