-- ============================================================
-- RECEPTION SALFA - Migration : référentiel familles d'articles
-- Compatible MySQL 5.7+ et MariaDB 10.3+
--
-- À exécuter UNE FOIS sur une base reception_salfa existante.
-- Pour une nouvelle installation, utilisez import_full.sql directement.
-- ============================================================

USE reception_salfa;

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

INSERT INTO familles_articles (code, libelle, couleur, ordre_affichage, actif) VALUES
('MEDIC', 'Médicaments', '#0D47A1', 1, TRUE),
('LABO', 'Laboratoire', '#10B981', 2, TRUE),
('DENT', 'Dentaire', '#8B5CF6', 3, TRUE),
('ECHO', 'Échographie', '#F59E0B', 4, TRUE),
('CONSULT', 'Consultation', '#06B6D4', 5, TRUE),
('HOSPIT', 'Hospitalisation', '#F43F5E', 6, TRUE),
('BLOC', 'Bloc opératoire', '#F97316', 7, TRUE)
ON DUPLICATE KEY UPDATE
    libelle = VALUES(libelle),
    couleur = VALUES(couleur),
    ordre_affichage = VALUES(ordre_affichage),
    actif = VALUES(actif);

DELIMITER $$

DROP PROCEDURE IF EXISTS ajouter_reference_familles_articles $$
CREATE PROCEDURE ajouter_reference_familles_articles()
BEGIN
    DECLARE colonne_existe INT DEFAULT 0;
    DECLARE index_existe INT DEFAULT 0;
    DECLARE contrainte_existe INT DEFAULT 0;

    SELECT COUNT(*) INTO colonne_existe
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'medicaments'
      AND COLUMN_NAME = 'famille_article_id';

    IF colonne_existe = 0 THEN
        ALTER TABLE medicaments
            ADD COLUMN famille_article_id SMALLINT UNSIGNED NULL AFTER id;
    END IF;

    -- Les données historiques sont rattachées à la famille Médicaments.
    UPDATE medicaments
    SET famille_article_id = (
        SELECT id FROM familles_articles WHERE code = 'MEDIC' LIMIT 1
    )
    WHERE famille_article_id IS NULL;

    SELECT COUNT(*) INTO index_existe
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'medicaments'
      AND INDEX_NAME = 'idx_medicaments_famille_article';

    IF index_existe = 0 THEN
        ALTER TABLE medicaments
            ADD INDEX idx_medicaments_famille_article (famille_article_id);
    END IF;

    SELECT COUNT(*) INTO contrainte_existe
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'medicaments'
      AND CONSTRAINT_NAME = 'fk_medicaments_famille_article'
      AND CONSTRAINT_TYPE = 'FOREIGN KEY';

    IF contrainte_existe = 0 THEN
        ALTER TABLE medicaments
            ADD CONSTRAINT fk_medicaments_famille_article
            FOREIGN KEY (famille_article_id) REFERENCES familles_articles(id)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$

CALL ajouter_reference_familles_articles() $$
DROP PROCEDURE ajouter_reference_familles_articles $$

DELIMITER ;

-- Contrôle après migration : les deux compteurs doivent être égaux au nombre
-- de familles/produits présents dans la base.
SELECT id, code, libelle, actif, ordre_affichage
FROM familles_articles
ORDER BY ordre_affichage, libelle;

SELECT COUNT(*) AS medicaments_sans_famille
FROM medicaments
WHERE famille_article_id IS NULL;
