-- ============================================================================
-- RECEPTION SALFA — Migration 002 : numérotation atomique + sessions
-- Schéma 1 → 2.
--
-- 1) Table `sequences` : avant, chaque poste calculait le n° de facture en
--    balayant tout l'historique puis en ajoutant +1 — deux caisses facturant
--    ensemble obtenaient le MÊME numéro. Désormais le compteur de chaque
--    période vit dans cette table et l'incrément s'y fait sous verrou
--    (SELECT … FOR UPDATE, endpoint api/index.php?action=numero).
-- 2) Table `sessions` : jetons de connexion (12 h) délivrés par
--    action=login. Les lectures/écritures (read_all, sync_all, numero) et le
--    changement de mot de passe (password, admin uniquement) exigent un jeton
--    valide ; les mots de passe ne transitent plus que dans ce cadre.
--
-- APPLICATION : importer ce fichier dans phpMyAdmin (base reception_salfa),
-- UNE seule fois. Réimportable sans risque (IF NOT EXISTS).
-- ============================================================================

USE `reception_salfa`;

CREATE TABLE IF NOT EXISTS `sequences` (
  `kind` VARCHAR(16) NOT NULL COMMENT 'standard (compteur quotidien AAMMJJ) ou societe (compteur mensuel AAMM, global toutes societes)',
  `periode` VARCHAR(8) NOT NULL COMMENT 'AAMMJJ (standard) ou AAMM (societe)',
  `seq` BIGINT NOT NULL DEFAULT 0 COMMENT 'dernier ordre attribue pour la periode',
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`kind`, `periode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sessions` (
  `jeton` VARCHAR(64) NOT NULL COMMENT 'jeton hexadécimal 64 caractères',
  `utilisateur_id` VARCHAR(64) NOT NULL,
  `role` VARCHAR(32) NOT NULL DEFAULT '' COMMENT 'rôle principal à la connexion',
  `expire_le` DATETIME NOT NULL,
  `cree_le` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`jeton`),
  KEY `idx_expire` (`expire_le`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE `parametres` SET `valeur` = '2' WHERE `cle` = 'schema_version';
