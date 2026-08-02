-- ============================================================================
--  RECEPTION SALFA — Migration des noms de tables vers le français
-- ============================================================================
--  À utiliser UNIQUEMENT si la base `reception_salfa` contient encore les
--  anciennes tables préfixées par `salfa_`.
--
--  1. Faites une sauvegarde de la base (Export phpMyAdmin / mysqldump).
--  2. Importez ce fichier dans phpMyAdmin AVANT d'ouvrir la version mise à jour
--     de l'application.
--
--  Le script renomme les tables sans modifier ni supprimer leurs données.
--  Si le nouveau schéma (et ses exemples) a déjà été importé, les données de
--  l'ancienne table restent la source de vérité : elles remplacent le contenu
--  de la nouvelle table, puis l'ancienne table `salfa_*` est retirée.
-- ============================================================================

USE `reception_salfa`;

DELIMITER //

DROP PROCEDURE IF EXISTS `migrer_table_vers_francais`//

CREATE PROCEDURE `migrer_table_vers_francais`(
    IN ancienne_table VARCHAR(64),
    IN nouvelle_table VARCHAR(64)
)
BEGIN
    DECLARE ancienne_existe TINYINT DEFAULT 0;
    DECLARE nouvelle_existe TINYINT DEFAULT 0;

    SELECT COUNT(*) INTO ancienne_existe
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ancienne_table;

    IF ancienne_existe > 0 THEN
        SELECT COUNT(*) INTO nouvelle_existe
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = nouvelle_table;

        IF nouvelle_existe > 0 THEN
            -- Le nouveau schéma et son jeu d'exemples ont peut-être déjà été
            -- importés. L'ancienne table est alors prioritaire afin de ne pas
            -- remplacer les données existantes par les exemples.
            SET @requete = CONCAT(
                'DELETE FROM `', REPLACE(nouvelle_table, '`', '``'), '`'
            );
            PREPARE requete FROM @requete;
            EXECUTE requete;
            DEALLOCATE PREPARE requete;

            SET @requete = CONCAT(
                'INSERT INTO `', REPLACE(nouvelle_table, '`', '``'),
                '` SELECT * FROM `', REPLACE(ancienne_table, '`', '``'), '`'
            );
            PREPARE requete FROM @requete;
            EXECUTE requete;
            DEALLOCATE PREPARE requete;

            SET @requete = CONCAT(
                'DROP TABLE `', REPLACE(ancienne_table, '`', '``'), '`'
            );
            PREPARE requete FROM @requete;
            EXECUTE requete;
            DEALLOCATE PREPARE requete;
        ELSE
            SET @requete = CONCAT(
                'RENAME TABLE `', REPLACE(ancienne_table, '`', '``'),
                '` TO `', REPLACE(nouvelle_table, '`', '``'), '`'
            );
            PREPARE requete FROM @requete;
            EXECUTE requete;
            DEALLOCATE PREPARE requete;
        END IF;
    END IF;
END//

CALL migrer_table_vers_francais('salfa_ticket_settings', 'parametres_impression')//
CALL migrer_table_vers_francais('salfa_counters', 'compteurs')//
CALL migrer_table_vers_francais('salfa_users', 'utilisateurs')//
CALL migrer_table_vers_francais('salfa_patients', 'patients')//
CALL migrer_table_vers_francais('salfa_consultations', 'consultations')//
CALL migrer_table_vers_francais('salfa_invoices', 'factures')//
CALL migrer_table_vers_francais('salfa_ventes', 'ventes')//
CALL migrer_table_vers_francais('salfa_vente_lines', 'lignes_vente')//
CALL migrer_table_vers_francais('salfa_vente_payments', 'paiements_vente')//
CALL migrer_table_vers_francais('salfa_articles', 'articles')//
CALL migrer_table_vers_francais('salfa_companies', 'societes')//
CALL migrer_table_vers_francais('salfa_company_billing_accounts', 'comptes_facturation_societes')//
CALL migrer_table_vers_francais('salfa_fournisseurs', 'fournisseurs')//
CALL migrer_table_vers_francais('salfa_familles', 'familles')//
CALL migrer_table_vers_francais('salfa_warehouse_services', 'services_depot')//
CALL migrer_table_vers_francais('salfa_lab_catalog', 'catalogue_laboratoire')//
CALL migrer_table_vers_francais('salfa_lab_requests', 'demandes_laboratoire')//
CALL migrer_table_vers_francais('salfa_journey', 'parcours_patient')//
CALL migrer_table_vers_francais('salfa_cash_closings', 'clotures_caisse')//
CALL migrer_table_vers_francais('salfa_audit_logs', 'journaux_audit')//
CALL migrer_table_vers_francais('salfa_notifications', 'notifications')//
CALL migrer_table_vers_francais('salfa_messages', 'messages')//
CALL migrer_table_vers_francais('salfa_stock_transfers', 'transferts_stock')//
CALL migrer_table_vers_francais('salfa_stock_entries', 'entrees_stock')//
CALL migrer_table_vers_francais('salfa_stock_movements', 'mouvements_stock')//
CALL migrer_table_vers_francais('salfa_movement_headers', 'entetes_mouvements')//
CALL migrer_table_vers_francais('salfa_movement_lines', 'lignes_mouvements')//
CALL migrer_table_vers_francais('salfa_inventory_sessions', 'sessions_inventaire')//
CALL migrer_table_vers_francais('salfa_pharma_delivery_items', 'lignes_livraison_pharmacie')//
CALL migrer_table_vers_francais('salfa_pharma_delivery_closings', 'clotures_livraison_pharmacie')//
CALL migrer_table_vers_francais('salfa_hb_records', 'dossiers_hospitalisation_bloc')//

DROP PROCEDURE `migrer_table_vers_francais`//

DELIMITER ;
