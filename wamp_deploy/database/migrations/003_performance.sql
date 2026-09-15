-- ============================================================================
-- RECEPTION SALFA — Migration 003 : révision d'état + index de rafraîchissement
-- Schéma 2 → 3.
--
-- POURQUOI (audit « 100 patients/jour, 10 ans ») :
--   1) `revision` — un compteur d'état. Les postes demandent toutes les 5 s
--      « la base a-t-elle changé ? » (action=poll : une ligne lue sur clé
--      primaire) et ne relisent TOUT l'état (read_all) que si oui. Sans cela,
--      5 postes × une relecture complète = le réseau local et PHP travaillent
--      en continu pour rien — et read_all devient mortel dès que la base
--      dépasse ~100 Mo (mémoire PHP).
--   2) `idx_maj (mis_a_jour)` — rend possible (à terme) une lecture
--      incrémentale « tout ce qui a changé depuis T », et permet le contrôle
--      d'antériorité / le tri par dernière écriture sans balayage complet.
--
-- APPLICATION : importer ce fichier dans phpMyAdmin (base reception_salfa),
-- UNE seule fois, APRÈS une sauvegarde (`outils/sauvegarder.bat`).
-- Réimportable sans risque (IF NOT EXISTS / ALTER ignoré si l'index existe déjà
-- — relancer ne casse rien, seul un avertissement « Duplicate key name »
-- éventuel s'affiche).
-- Coût sur une base déjà pleine : la création des index lit chaque table une
-- fois. À faire HORS HEURES D'OUVERTURE (100 000 lignes ≈ quelques dizaines de
-- secondes sur le matériel d'un cabinet).
-- ============================================================================

USE `reception_salfa`;

-- --------------------------------------------------------------------------
-- 1) Révision d'état (une seule ligne, id = 1)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `revision` (
  `id` TINYINT NOT NULL,
  `rev` BIGINT NOT NULL DEFAULT 0 COMMENT 'incrémentée à chaque écriture ayant réellement modifié des lignes',
  `mis_a_jour` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `revision` (`id`, `rev`) VALUES (1, 1);

-- --------------------------------------------------------------------------
-- 2) Index de fraîcheur sur toutes les tables d'entités
--    (les DROP conditionnels ne sont pas possibles en MySQL 5.7 sans procédure
--     stockée : on crée uniquement ce qui manque, avec des procédures.)
-- --------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS `salfa_add_idx_maj`;
CREATE PROCEDURE `salfa_add_idx_maj`(IN tbl VARCHAR(64))
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl)
     AND NOT EXISTS (SELECT 1 FROM information_schema.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = 'idx_maj')
  THEN
    SET @sql = CONCAT('ALTER TABLE `', tbl, '` ADD INDEX `idx_maj` (`mis_a_jour`)');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END;

-- Index créé table par table, silencieusement ignoré si la table est absente.
DROP PROCEDURE IF EXISTS `salfa_mig_003`;
CREATE PROCEDURE `salfa_mig_003`()
BEGIN
  DECLARE fini INT DEFAULT 0;
  DECLARE t VARCHAR(64);
  DECLARE cur CURSOR FOR
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (
      'patients','consultations','factures','ventes','lignes_vente','paiements_vente',
      'demandes_laboratoire','parcours_patient','livraisons_pharmacie','entrees_stock',
      'transferts_stock','mouvements_stock','mouvements_entetes','mouvements_lignes',
      'comptes_facturation','dossiers_hospit_bloc','messages','notifications','clotures_caisse',
      'journal_audit','inventaires','clotures_pharmacie','utilisateurs','societes','articles',
      'fournisseurs','familles','catalogue_laboratoire','services_depot','etablissements',
      'assurance_societes','assurance_personnes','assurance_familles','assurance_prestations',
      'assurance_paiements');
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET fini = 1;
  OPEN cur;
  lecture: LOOP
    FETCH cur INTO t;
    IF fini = 1 THEN
      LEAVE lecture;
    END IF;
    CALL salfa_add_idx_maj(t);
  END LOOP;
  CLOSE cur;
END;

CALL salfa_mig_003();

DROP PROCEDURE IF EXISTS `salfa_mig_003`;
DROP PROCEDURE IF EXISTS `salfa_add_idx_maj`;

-- --------------------------------------------------------------------------
-- 3) Hygiène : les sessions expirées ne s'accumulent pas (nettoyées à chaque
--    connexion, mais un serveur inutilisé pendant des semaines en garde) ;
--    on repart proprement.
-- --------------------------------------------------------------------------

DELETE FROM `sessions` WHERE `expire_le` < NOW();

UPDATE `parametres` SET `valeur` = '3' WHERE `cle` = 'schema_version';
INSERT IGNORE INTO `parametres` (`cle`, `valeur`) VALUES ('schema_version', '3');
