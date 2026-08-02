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
CREATE TABLE IF NOT EXISTS `salfa_ticket_settings` (
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
CREATE TABLE IF NOT EXISTS `salfa_counters` (
  `id`         VARCHAR(64) NOT NULL,
  `value`      BIGINT      NOT NULL DEFAULT 0,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Utilisateurs / comptes de connexion
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_users` (
  `id`       VARCHAR(64) NOT NULL,
  `name`     VARCHAR(255) DEFAULT NULL,
  `role`     VARCHAR(32)  DEFAULT NULL,
  `data_json` LONGTEXT   NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Patients
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_patients` (
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
  KEY `idx_patients_status` (`status`),
  KEY `idx_patients_last_name` (`last_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Consultations
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_consultations` (
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
CREATE TABLE IF NOT EXISTS `salfa_invoices` (
  `id`              VARCHAR(64) NOT NULL,
  `patient_id`      VARCHAR(64) DEFAULT NULL,
  `consultation_id` VARCHAR(64) DEFAULT NULL,
  `client_type`     VARCHAR(16) DEFAULT NULL,
  `status`          VARCHAR(16) DEFAULT NULL,
  `total_amount`    DECIMAL(15,2) DEFAULT 0,
  `created_at`      VARCHAR(64) DEFAULT NULL,
  `data_json`       LONGTEXT   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_invoices_patient` (`patient_id`),
  KEY `idx_invoices_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Table unifiée des VENTES (en-têtes) — entité centrale du reporting caisse
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_ventes` (
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
--  Lignes de vente (1:N vers salfa_ventes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_vente_lines` (
  `id`         VARCHAR(64) NOT NULL,
  `vente_id`   VARCHAR(64) NOT NULL,
  `article_id` VARCHAR(64) DEFAULT NULL,
  `article_name` VARCHAR(255) DEFAULT NULL,
  `quantity`   DECIMAL(15,2) DEFAULT 0,
  `unit_price` DECIMAL(15,2) DEFAULT 0,
  `data_json`  LONGTEXT   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vente_lines_vente` (`vente_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Paiements rattachés aux ventes (paiements partiels)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_vente_payments` (
  `id`       VARCHAR(64) NOT NULL,
  `vente_id` VARCHAR(64) NOT NULL,
  `amount`   DECIMAL(15,2) DEFAULT 0,
  `method`   VARCHAR(40) DEFAULT NULL,
  `date`     VARCHAR(64) DEFAULT NULL,
  `data_json` LONGTEXT  NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_vente_payments_vente` (`vente_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Catalogue articles / médicaments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_articles` (
  `id`            VARCHAR(64) NOT NULL,
  `name`          VARCHAR(255) DEFAULT NULL,
  `family`        VARCHAR(8)   DEFAULT NULL,
  `unit`          VARCHAR(32)  DEFAULT NULL,
  `stock_central` DECIMAL(15,2) DEFAULT 0,
  `stock_pharmacie` DECIMAL(15,2) DEFAULT 0,
  `barcode`       VARCHAR(64)  DEFAULT NULL,
  `data_json`     LONGTEXT   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_articles_family` (`family`),
  KEY `idx_articles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Sociétés conventionnées (facturation)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_companies` (
  `id`             VARCHAR(64) NOT NULL,
  `name`           VARCHAR(255) DEFAULT NULL,
  `settlement_mode` VARCHAR(24) DEFAULT NULL,
  `data_json`      LONGTEXT   NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Comptes de facturation mensuels des sociétés
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_company_billing_accounts` (
  `id`            VARCHAR(64) NOT NULL,
  `company`       VARCHAR(255) DEFAULT NULL,
  `month`         VARCHAR(8)   DEFAULT NULL,
  `status`        VARCHAR(16)  DEFAULT NULL,
  `total_amount`  DECIMAL(15,2) DEFAULT 0,
  `paid_amount`   DECIMAL(15,2) DEFAULT 0,
  `data_json`     LONGTEXT   NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cba_company_month` (`company`, `month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Fournisseurs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_fournisseurs` (
  `id`      VARCHAR(64) NOT NULL,
  `name`    VARCHAR(255) DEFAULT NULL,
  `phone`   VARCHAR(64)  DEFAULT NULL,
  `data_json` LONGTEXT  NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Familles d'articles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_familles` (
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
CREATE TABLE IF NOT EXISTS `salfa_warehouse_services` (
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
CREATE TABLE IF NOT EXISTS `salfa_lab_catalog` (
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
CREATE TABLE IF NOT EXISTS `salfa_lab_requests` (
  `id`         VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) DEFAULT NULL,
  `consultation_id` VARCHAR(64) DEFAULT NULL,
  `exam_type`  VARCHAR(255) DEFAULT NULL,
  `status`     VARCHAR(24) DEFAULT NULL,
  `urgent`     TINYINT(1) DEFAULT 0,
  `requested_at` VARCHAR(64) DEFAULT NULL,
  `data_json`  LONGTEXT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_lab_requests_patient` (`patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Parcours patient (timeline)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_journey` (
  `id`         VARCHAR(64) NOT NULL,
  `patient_id` VARCHAR(64) DEFAULT NULL,
  `timestamp`  VARCHAR(64) DEFAULT NULL,
  `department` VARCHAR(24) DEFAULT NULL,
  `action`     VARCHAR(255) DEFAULT NULL,
  `data_json`  LONGTEXT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_journey_patient` (`patient_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Clôtures de caisse (Z)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_cash_closings` (
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
CREATE TABLE IF NOT EXISTS `salfa_audit_logs` (
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
CREATE TABLE IF NOT EXISTS `salfa_notifications` (
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
CREATE TABLE IF NOT EXISTS `salfa_messages` (
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
CREATE TABLE IF NOT EXISTS `salfa_stock_transfers` (
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
CREATE TABLE IF NOT EXISTS `salfa_stock_entries` (
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
CREATE TABLE IF NOT EXISTS `salfa_stock_movements` (
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
CREATE TABLE IF NOT EXISTS `salfa_movement_headers` (
  `id`      VARCHAR(64) NOT NULL,
  `type`    VARCHAR(20) DEFAULT NULL,
  `ref`     VARCHAR(64) DEFAULT NULL,
  `date`    VARCHAR(64) DEFAULT NULL,
  `user_id` VARCHAR(64) DEFAULT NULL,
  `data_json` LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Lignes de mouvement (1:N vers salfa_movement_headers)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_movement_lines` (
  `id`          VARCHAR(64) NOT NULL,
  `movement_id` VARCHAR(64) NOT NULL,
  `article_id`  VARCHAR(64) DEFAULT NULL,
  `article_name` VARCHAR(255) DEFAULT NULL,
  `quantity`    DECIMAL(15,2) DEFAULT 0,
  `data_json`   LONGTEXT NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_movement_lines_header` (`movement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
--  Sessions d'inventaire
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `salfa_inventory_sessions` (
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
CREATE TABLE IF NOT EXISTS `salfa_pharma_delivery_items` (
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
CREATE TABLE IF NOT EXISTS `salfa_pharma_delivery_closings` (
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
CREATE TABLE IF NOT EXISTS `salfa_hb_records` (
  `id`          VARCHAR(64) NOT NULL,
  `patient_id`  VARCHAR(64) DEFAULT NULL,
  `patient_name` VARCHAR(255) DEFAULT NULL,
  `type`        VARCHAR(8) DEFAULT NULL,
  `client_type` VARCHAR(16) DEFAULT NULL,
  `opened_at`   VARCHAR(64) DEFAULT NULL,
  `data_json`   LONGTEXT NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
