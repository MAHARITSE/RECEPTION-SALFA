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
