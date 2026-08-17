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

-- Configuration : familles d'articles (4 familles par défaut : MEDIC, LABO, ECHO, DENT)
INSERT INTO `familles` (`id`, `data_json`, `code`, `name`, `color`)
SELECT `id`, `data_json`, `code`, `name`, `color`
FROM (
    SELECT 'fam-medic' AS `id`, '{"id":"fam-medic","code":"MEDIC","name":"Médicaments","color":"#0D47A1","order":1}' AS `data_json`, 'MEDIC' AS `code`, 'Médicaments' AS `name`, '#0D47A1' AS `color`
    UNION ALL SELECT 'fam-labo', '{"id":"fam-labo","code":"LABO","name":"Laboratoire","color":"#10B981","order":2}', 'LABO', 'Laboratoire', '#10B981'
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
-- ----------------------------------------------------------------------------
--  BASE UNIFIÉE DES ARTICLES — familles LABO (examens + consommables) et ECHO
--  (actes + gel). Logique « articles unifiés » : Magasinier, Laboratoire,
--  Médecin, Caisse et Facturation exploitent la table articles comme
--  référentiel unique. Insertions idempotentes par identifiant (INSERT IGNORE) :
--  aucun article existant n est écrasé, les données déjà en base sont conservées.
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO `articles`
(`id`, `name`, `family`, `unit`, `barcode`, `prix_achat`, `prix_comptoir`, `prix_societe`, `prix_externe`, `stock_central`, `stock_pharmacie`, `data_json`)
VALUES
('exam-001', 'NFS (Numération Formule Sanguine)', 'LABO', 'analyse', 'LAB001', 0, 15000, 13000, 18000, 0, 0, '{"id":"exam-001","name":"NFS (Numération Formule Sanguine)","code":"LAB001","family":"LABO","unit":"analyse","barcode":"LAB001","priceComptoir":15000,"priceSociete":13000,"priceExterne":18000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"hematologie","parameters":["Globules Rouges","Globules Blancs","Hémoglobine","Plaquettes","Hématocrite"],"sampleType":"Sang veineux (EDTA)","urgentPrice":25000,"durationHours":4}'),
('exam-002', 'Glycémie à jeun', 'LABO', 'analyse', 'LAB002', 0, 8000, 7000, 10000, 0, 0, '{"id":"exam-002","name":"Glycémie à jeun","code":"LAB002","family":"LABO","unit":"analyse","barcode":"LAB002","priceComptoir":8000,"priceSociete":7000,"priceExterne":10000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"biochimie","parameters":["Glucose"],"sampleType":"Sang veineux","urgentPrice":15000,"durationHours":1}'),
('exam-003', 'Créatinine', 'LABO', 'analyse', 'LAB003', 0, 10000, 9000, 12000, 0, 0, '{"id":"exam-003","name":"Créatinine","code":"LAB003","family":"LABO","unit":"analyse","barcode":"LAB003","priceComptoir":10000,"priceSociete":9000,"priceExterne":12000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"biochimie","parameters":["Créatinine"],"sampleType":"Sang veineux","urgentPrice":18000,"durationHours":2}'),
('exam-004', 'CRP (Protéine C-Réactive)', 'LABO', 'analyse', 'LAB004', 0, 7000, 6000, 9000, 0, 0, '{"id":"exam-004","name":"CRP (Protéine C-Réactive)","code":"LAB004","family":"LABO","unit":"analyse","barcode":"LAB004","priceComptoir":7000,"priceSociete":6000,"priceExterne":9000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"biochimie","parameters":["CRP"],"sampleType":"Sang veineux","urgentPrice":12000,"durationHours":1}'),
('exam-005', 'Groupe Sanguin & Rhésus', 'LABO', 'analyse', 'LAB005', 0, 10000, 9000, 12000, 0, 0, '{"id":"exam-005","name":"Groupe Sanguin & Rhésus","code":"LAB005","family":"LABO","unit":"analyse","barcode":"LAB005","priceComptoir":10000,"priceSociete":9000,"priceExterne":12000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"hematologie","parameters":["Groupe ABO","Rhésus"],"sampleType":"Sang veineux","urgentPrice":15000,"durationHours":2}'),
('exam-006', 'ECBU (Culture + Antibiogramme)', 'LABO', 'analyse', 'LAB006', 0, 15000, 13000, 18000, 0, 0, '{"id":"exam-006","name":"ECBU (Culture + Antibiogramme)","code":"LAB006","family":"LABO","unit":"analyse","barcode":"LAB006","priceComptoir":15000,"priceSociete":13000,"priceExterne":18000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"bacteriologie","parameters":["Culture","Antibiogramme"],"sampleType":"Urine (pot stérile)","urgentPrice":25000,"durationHours":48}'),
('exam-007', 'Goutte épaisse (Plasmodium)', 'LABO', 'analyse', 'LAB007', 0, 10000, 9000, 12000, 0, 0, '{"id":"exam-007","name":"Goutte épaisse (Plasmodium)","code":"LAB007","family":"LABO","unit":"analyse","barcode":"LAB007","priceComptoir":10000,"priceSociete":9000,"priceExterne":12000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"parasitologie","parameters":["Plasmodium"],"sampleType":"Sang veineux","urgentPrice":18000,"durationHours":4}'),
('exam-008', 'TP / INR', 'LABO', 'analyse', 'LAB008', 0, 12000, 11000, 15000, 0, 0, '{"id":"exam-008","name":"TP / INR","code":"LAB008","family":"LABO","unit":"analyse","barcode":"LAB008","priceComptoir":12000,"priceSociete":11000,"priceExterne":15000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"hemostase","parameters":["TP","INR"],"sampleType":"Sang veineux (citraté)","urgentPrice":20000,"durationHours":2}'),
('exam-009', 'Bilan lipidique complet', 'LABO', 'analyse', 'LAB009', 0, 20000, 18000, 25000, 0, 0, '{"id":"exam-009","name":"Bilan lipidique complet","code":"LAB009","family":"LABO","unit":"analyse","barcode":"LAB009","priceComptoir":20000,"priceSociete":18000,"priceExterne":25000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"biochimie","parameters":["Cholestérol Total","HDL","LDL","Triglycérides"],"sampleType":"Sang veineux","urgentPrice":30000,"durationHours":2}'),
('exam-010', 'Bilan hépatique complet', 'LABO', 'analyse', 'LAB010', 0, 22000, 20000, 28000, 0, 0, '{"id":"exam-010","name":"Bilan hépatique complet","code":"LAB010","family":"LABO","unit":"analyse","barcode":"LAB010","priceComptoir":22000,"priceSociete":20000,"priceExterne":28000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"biochimie","parameters":["ASAT","ALAT","GGT","Bilirubine"],"sampleType":"Sang veineux","urgentPrice":35000,"durationHours":2}'),
('exam-011', 'Bilan rénal complet', 'LABO', 'analyse', 'LAB011', 0, 18000, 16000, 22000, 0, 0, '{"id":"exam-011","name":"Bilan rénal complet","code":"LAB011","family":"LABO","unit":"analyse","barcode":"LAB011","priceComptoir":18000,"priceSociete":16000,"priceExterne":22000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"biochimie","parameters":["Créatinine","Urée","Acide Urique"],"sampleType":"Sang veineux","urgentPrice":28000,"durationHours":2}'),
('exam-012', 'Ionogramme sanguin', 'LABO', 'analyse', 'LAB012', 0, 15000, 13000, 18000, 0, 0, '{"id":"exam-012","name":"Ionogramme sanguin","code":"LAB012","family":"LABO","unit":"analyse","barcode":"LAB012","priceComptoir":15000,"priceSociete":13000,"priceExterne":18000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"biochimie","parameters":["Sodium","Potassium","Chlore"],"sampleType":"Sang veineux","urgentPrice":22000,"durationHours":2}'),
('exam-013', 'TDR Paludisme', 'LABO', 'analyse', 'LAB013', 0, 5000, 4500, 6000, 0, 0, '{"id":"exam-013","name":"TDR Paludisme","code":"LAB013","family":"LABO","unit":"analyse","barcode":"LAB013","priceComptoir":5000,"priceSociete":4500,"priceExterne":6000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"parasitologie","parameters":["TDR Paludisme"],"sampleType":"Sang capillaire","urgentPrice":8000,"durationHours":1}'),
('exam-014', 'Sérologie VIH / Syphilis', 'LABO', 'analyse', 'LAB014', 0, 12000, 10000, 15000, 0, 0, '{"id":"exam-014","name":"Sérologie VIH / Syphilis","code":"LAB014","family":"LABO","unit":"analyse","barcode":"LAB014","priceComptoir":12000,"priceSociete":10000,"priceExterne":15000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true,"category":"serologie","parameters":["VIH 1/2","TPHA/VDRL"],"sampleType":"Sang veineux","urgentPrice":20000,"durationHours":2}'),
('art-006', 'Tube EDTA', 'LABO', 'unité', '619100000006', 100, 300, 250, 400, 200, 50, '{"id":"art-006","name":"Tube EDTA","family":"LABO","unit":"unité","barcode":"619100000006","priceComptoir":300,"priceSociete":250,"priceExterne":400,"purchasePrice":100,"stockCentral":200,"stockPharmacie":50,"minStockCentral":30,"minStockPharmacie":20}'),
('art-007', 'Réactif Glycémie', 'LABO', 'flacon', '619100000007', 2500, 5000, 4500, 6000, 30, 10, '{"id":"art-007","name":"Réactif Glycémie","family":"LABO","unit":"flacon","barcode":"619100000007","priceComptoir":5000,"priceSociete":4500,"priceExterne":6000,"purchasePrice":2500,"stockCentral":30,"stockPharmacie":10,"minStockCentral":5,"minStockPharmacie":3,"supplier":"DISPHAR LABO","expiryDate":"2027-03-31"}'),
('art-lab-015', 'Lames porte-objet', 'LABO', 'boîte', '619100000015', 4000, 8000, 7000, 10000, 50, 15, '{"id":"art-lab-015","name":"Lames porte-objet","family":"LABO","unit":"boîte","barcode":"619100000015","priceComptoir":8000,"priceSociete":7000,"priceExterne":10000,"purchasePrice":4000,"stockCentral":50,"stockPharmacie":15,"minStockCentral":10,"minStockPharmacie":5}'),
('echo-abd', 'Échographie abdominale', 'ECHO', 'acte', 'ECH001', 0, 25000, 22000, 30000, 0, 0, '{"id":"echo-abd","name":"Échographie abdominale","code":"ECH001","family":"ECHO","unit":"acte","barcode":"ECH001","priceComptoir":25000,"priceSociete":22000,"priceExterne":30000,"urgentPrice":35000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true}'),
('echo-pel', 'Échographie pelvienne', 'ECHO', 'acte', 'ECH002', 0, 25000, 22000, 30000, 0, 0, '{"id":"echo-pel","name":"Échographie pelvienne","code":"ECH002","family":"ECHO","unit":"acte","barcode":"ECH002","priceComptoir":25000,"priceSociete":22000,"priceExterne":30000,"urgentPrice":35000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true}'),
('echo-obs', 'Échographie obstétricale', 'ECHO', 'acte', 'ECH003', 0, 25000, 22000, 30000, 0, 0, '{"id":"echo-obs","name":"Échographie obstétricale","code":"ECH003","family":"ECHO","unit":"acte","barcode":"ECH003","priceComptoir":25000,"priceSociete":22000,"priceExterne":30000,"urgentPrice":35000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true}'),
('echo-car', 'Échographie cardiaque (ETT)', 'ECHO', 'acte', 'ECH004', 0, 40000, 35000, 45000, 0, 0, '{"id":"echo-car","name":"Échographie cardiaque (ETT)","code":"ECH004","family":"ECHO","unit":"acte","barcode":"ECH004","priceComptoir":40000,"priceSociete":35000,"priceExterne":45000,"urgentPrice":50000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true}'),
('echo-ren', 'Échographie rénale', 'ECHO', 'acte', 'ECH005', 0, 25000, 22000, 30000, 0, 0, '{"id":"echo-ren","name":"Échographie rénale","code":"ECH005","family":"ECHO","unit":"acte","barcode":"ECH005","priceComptoir":25000,"priceSociete":22000,"priceExterne":30000,"urgentPrice":35000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true}'),
('echo-thy', 'Échographie thyroïdienne', 'ECHO', 'acte', 'ECH006', 0, 25000, 22000, 30000, 0, 0, '{"id":"echo-thy","name":"Échographie thyroïdienne","code":"ECH006","family":"ECHO","unit":"acte","barcode":"ECH006","priceComptoir":25000,"priceSociete":22000,"priceExterne":30000,"urgentPrice":35000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true}'),
('echo-mam', 'Échographie mammaire', 'ECHO', 'acte', 'ECH007', 0, 25000, 22000, 30000, 0, 0, '{"id":"echo-mam","name":"Échographie mammaire","code":"ECH007","family":"ECHO","unit":"acte","barcode":"ECH007","priceComptoir":25000,"priceSociete":22000,"priceExterne":30000,"urgentPrice":35000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true}'),
('echo-pmo', 'Échographie des parties molles', 'ECHO', 'acte', 'ECH008', 0, 25000, 22000, 30000, 0, 0, '{"id":"echo-pmo","name":"Échographie des parties molles","code":"ECH008","family":"ECHO","unit":"acte","barcode":"ECH008","priceComptoir":25000,"priceSociete":22000,"priceExterne":30000,"urgentPrice":35000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true}'),
('echo-dop', 'Échographie Doppler', 'ECHO', 'acte', 'ECH009', 0, 35000, 30000, 40000, 0, 0, '{"id":"echo-dop","name":"Échographie Doppler","code":"ECH009","family":"ECHO","unit":"acte","barcode":"ECH009","priceComptoir":35000,"priceSociete":30000,"priceExterne":40000,"urgentPrice":45000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true}'),
('echo-pro', 'Échographie prostatique', 'ECHO', 'acte', 'ECH010', 0, 25000, 22000, 30000, 0, 0, '{"id":"echo-pro","name":"Échographie prostatique","code":"ECH010","family":"ECHO","unit":"acte","barcode":"ECH010","priceComptoir":25000,"priceSociete":22000,"priceExterne":30000,"urgentPrice":35000,"purchasePrice":0,"stockCentral":0,"stockPharmacie":0,"minStockCentral":0,"minStockPharmacie":0,"alertDisabledCentral":true,"alertDisabledPharmacie":true}'),
('art-008', 'Gel échographie', 'ECHO', 'flacon', '619100000008', 2000, 5000, 4000, 6000, 0, 4, '{"id":"art-008","name":"Gel échographie","family":"ECHO","unit":"flacon","barcode":"619100000008","priceComptoir":5000,"priceSociete":4000,"priceExterne":6000,"purchasePrice":2000,"stockCentral":0,"stockPharmacie":4,"minStockCentral":5,"minStockPharmacie":2}');

-- ----------------------------------------------------------------------------
--  Miroir de compatibilité : catalogue_laboratoire (14 examens standards).
--  La table articles reste la source de vérité ; ce miroir est réaligné à
--  chaque démarrage de l application. Insertions idempotentes (INSERT IGNORE).
-- ----------------------------------------------------------------------------
INSERT IGNORE INTO `catalogue_laboratoire` (`id`, `code`, `name`, `category`, `data_json`)
VALUES
('exam-001', 'LAB001', 'NFS (Numération Formule Sanguine)', 'hematologie', '{"id":"exam-001","code":"LAB001","name":"NFS (Numération Formule Sanguine)","category":"hematologie","parameters":["Globules Rouges","Globules Blancs","Hémoglobine","Plaquettes","Hématocrite"],"sampleType":"Sang veineux (EDTA)","priceComptoir":15000,"priceSociete":13000,"priceExterne":18000,"urgentPrice":25000,"durationHours":4}'),
('exam-002', 'LAB002', 'Glycémie à jeun', 'biochimie', '{"id":"exam-002","code":"LAB002","name":"Glycémie à jeun","category":"biochimie","parameters":["Glucose"],"sampleType":"Sang veineux","priceComptoir":8000,"priceSociete":7000,"priceExterne":10000,"urgentPrice":15000,"durationHours":1}'),
('exam-003', 'LAB003', 'Créatinine', 'biochimie', '{"id":"exam-003","code":"LAB003","name":"Créatinine","category":"biochimie","parameters":["Créatinine"],"sampleType":"Sang veineux","priceComptoir":10000,"priceSociete":9000,"priceExterne":12000,"urgentPrice":18000,"durationHours":2}'),
('exam-004', 'LAB004', 'CRP (Protéine C-Réactive)', 'biochimie', '{"id":"exam-004","code":"LAB004","name":"CRP (Protéine C-Réactive)","category":"biochimie","parameters":["CRP"],"sampleType":"Sang veineux","priceComptoir":7000,"priceSociete":6000,"priceExterne":9000,"urgentPrice":12000,"durationHours":1}'),
('exam-005', 'LAB005', 'Groupe Sanguin & Rhésus', 'hematologie', '{"id":"exam-005","code":"LAB005","name":"Groupe Sanguin & Rhésus","category":"hematologie","parameters":["Groupe ABO","Rhésus"],"sampleType":"Sang veineux","priceComptoir":10000,"priceSociete":9000,"priceExterne":12000,"urgentPrice":15000,"durationHours":2}'),
('exam-006', 'LAB006', 'ECBU (Culture + Antibiogramme)', 'bacteriologie', '{"id":"exam-006","code":"LAB006","name":"ECBU (Culture + Antibiogramme)","category":"bacteriologie","parameters":["Culture","Antibiogramme"],"sampleType":"Urine (pot stérile)","priceComptoir":15000,"priceSociete":13000,"priceExterne":18000,"urgentPrice":25000,"durationHours":48}'),
('exam-007', 'LAB007', 'Goutte épaisse (Plasmodium)', 'parasitologie', '{"id":"exam-007","code":"LAB007","name":"Goutte épaisse (Plasmodium)","category":"parasitologie","parameters":["Plasmodium"],"sampleType":"Sang veineux","priceComptoir":10000,"priceSociete":9000,"priceExterne":12000,"urgentPrice":18000,"durationHours":4}'),
('exam-008', 'LAB008', 'TP / INR', 'hemostase', '{"id":"exam-008","code":"LAB008","name":"TP / INR","category":"hemostase","parameters":["TP","INR"],"sampleType":"Sang veineux (citraté)","priceComptoir":12000,"priceSociete":11000,"priceExterne":15000,"urgentPrice":20000,"durationHours":2}'),
('exam-009', 'LAB009', 'Bilan lipidique complet', 'biochimie', '{"id":"exam-009","code":"LAB009","name":"Bilan lipidique complet","category":"biochimie","parameters":["Cholestérol Total","HDL","LDL","Triglycérides"],"sampleType":"Sang veineux","priceComptoir":20000,"priceSociete":18000,"priceExterne":25000,"urgentPrice":30000,"durationHours":2}'),
('exam-010', 'LAB010', 'Bilan hépatique complet', 'biochimie', '{"id":"exam-010","code":"LAB010","name":"Bilan hépatique complet","category":"biochimie","parameters":["ASAT","ALAT","GGT","Bilirubine"],"sampleType":"Sang veineux","priceComptoir":22000,"priceSociete":20000,"priceExterne":28000,"urgentPrice":35000,"durationHours":2}'),
('exam-011', 'LAB011', 'Bilan rénal complet', 'biochimie', '{"id":"exam-011","code":"LAB011","name":"Bilan rénal complet","category":"biochimie","parameters":["Créatinine","Urée","Acide Urique"],"sampleType":"Sang veineux","priceComptoir":18000,"priceSociete":16000,"priceExterne":22000,"urgentPrice":28000,"durationHours":2}'),
('exam-012', 'LAB012', 'Ionogramme sanguin', 'biochimie', '{"id":"exam-012","code":"LAB012","name":"Ionogramme sanguin","category":"biochimie","parameters":["Sodium","Potassium","Chlore"],"sampleType":"Sang veineux","priceComptoir":15000,"priceSociete":13000,"priceExterne":18000,"urgentPrice":22000,"durationHours":2}'),
('exam-013', 'LAB013', 'TDR Paludisme', 'parasitologie', '{"id":"exam-013","code":"LAB013","name":"TDR Paludisme","category":"parasitologie","parameters":["TDR Paludisme"],"sampleType":"Sang capillaire","priceComptoir":5000,"priceSociete":4500,"priceExterne":6000,"urgentPrice":8000,"durationHours":1}'),
('exam-014', 'LAB014', 'Sérologie VIH / Syphilis', 'serologie', '{"id":"exam-014","code":"LAB014","name":"Sérologie VIH / Syphilis","category":"serologie","parameters":["VIH 1/2","TPHA/VDRL"],"sampleType":"Sang veineux","priceComptoir":12000,"priceSociete":10000,"priceExterne":15000,"urgentPrice":20000,"durationHours":2}');
