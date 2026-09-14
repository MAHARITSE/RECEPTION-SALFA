-- ============================================================================
-- RECEPTION SALFA — Schéma MySQL (version WAMP locale)
-- Base : reception_salfa | Moteur : InnoDB | Jeu de caractères : utf8mb4
--
-- PRINCIPE : une table par entité métier (noms en français), avec pour
-- chaque enregistrement :
--   id          → identifiant unique (PK, jamais réutilisé)
--   donnees     → objet JSON complet (même structure que l'application)
--   numero_ref  → n° de facture extrait (ventes/factures, requêtes + doublons)
--   dossier_ref → n° de dossier extrait (patients, requêtes + doublons)
--   mis_a_jour  → horodatage automatique de dernière écriture
--
-- Ce modèle suit exactement le protocole de l'application (read_all/sync_all)
-- et reste compatible avec les évolutions des écrans sans migration SQL.
-- Les tables `parametres` (réglages, compteurs JSON) et `compteurs`
-- (séquences numériques) complètent le schéma.
--
-- INSTALLATION : importer ce fichier dans phpMyAdmin (ou en ligne de
-- commande), puis importer `seed.sql` pour les comptes par défaut.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `reception_salfa`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `reception_salfa`;

-- --------------------------------------------------------------------------
-- Suivi assurance / facturation sociétés
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `assurance_societes` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assurance_personnes` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assurance_familles` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assurance_prestations` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `assurance_paiements` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Patients & parcours de soins
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `patients` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `consultations` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `parcours_patient` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Facturation & caisse
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `factures` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ventes` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lignes_vente` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `paiements_vente` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `comptes_facturation` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `dossiers_hospit_bloc` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `clotures_caisse` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Laboratoire & pharmacie
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `demandes_laboratoire` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `catalogue_laboratoire` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `livraisons_pharmacie` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `clotures_pharmacie` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Stocks & magasin
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `articles` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `entrees_stock` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `transferts_stock` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mouvements_stock` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mouvements_entetes` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mouvements_lignes` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventaires` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `services_depot` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Référentiels & système
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `utilisateurs` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `societes` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fournisseurs` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `familles` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `etablissements` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `messages` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `journal_audit` (
  `id` VARCHAR(64) NOT NULL,
  `donnees` JSON NOT NULL,
  `numero_ref` VARCHAR(64) NULL DEFAULT NULL,
  `dossier_ref` VARCHAR(64) NULL DEFAULT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_numero` (`numero_ref`),
  KEY `idx_dossier` (`dossier_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Paramètres (objets uniques : réglages tickets, factures mensuelles…)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `parametres` (
  `cle` VARCHAR(64) NOT NULL,
  `valeur` JSON NOT NULL,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`cle`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Compteurs (séquences numériques : ne diminuent jamais)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `compteurs` (
  `cle` VARCHAR(64) NOT NULL,
  `valeur` BIGINT NOT NULL DEFAULT 0,
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`cle`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Séquences de numérotation (attribution atomique multi-caisses, schéma v2)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `sequences` (
  `kind` VARCHAR(16) NOT NULL COMMENT 'standard (compteur quotidien AAMMJJ) ou societe (compteur mensuel AAMM, global toutes societes)',
  `periode` VARCHAR(8) NOT NULL COMMENT 'AAMMJJ (standard) ou AAMM (societe)',
  `seq` BIGINT NOT NULL DEFAULT 0 COMMENT 'dernier ordre attribue pour la periode',
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`kind`, `periode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Sessions de connexion (jetons 12 h, délivrés par action=login)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `sessions` (
  `jeton` VARCHAR(64) NOT NULL COMMENT 'jeton hexadécimal 64 caractères',
  `utilisateur_id` VARCHAR(64) NOT NULL,
  `role` VARCHAR(32) NOT NULL DEFAULT '' COMMENT 'rôle principal à la connexion',
  `expire_le` DATETIME NOT NULL,
  `cree_le` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`jeton`),
  KEY `idx_expire` (`expire_le`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------------------------
-- Valeurs initiales (idempotent : réimportable sans risque)
-- --------------------------------------------------------------------------

INSERT IGNORE INTO `parametres` (`cle`, `valeur`) VALUES ('schema_version', '2');
INSERT IGNORE INTO `compteurs` (`cle`, `valeur`) VALUES ('factureCounter', 0), ('pharmaClosingCounter', 0);
