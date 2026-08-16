<?php
/**
 * Connexion PDO à MySQL — RECEPTION SALFA.
 * Inspirée de LogBara / Bar POS : requêtes préparées, strictes et utf8mb4.
 */

declare(strict_types=1);

/**
 * Retourne une connexion PDO vers la base MySQL configurée.
 * @return PDO
 */
function reception_salfa_database(array $config): PDO
{
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $config['host'],
        (int) $config['port'],
        $config['database'],
        $config['charset'] ?? 'utf8mb4'
    );

    return new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci",
    ]);
}

/**
 * JSON-safe : sérialise une valeur quelconque en JSON UTF-8.
 */
function reception_salfa_json_encode($value): string
{
    $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('Impossible de sérialiser les données en JSON.');
    }
    return $json;
}

/**
 * JSON-safe : décode une chaîne JSON en tableau associatif.
 */
function reception_salfa_json_decode(string $json): array
{
    $value = json_decode($json, true);
    if ($value === null) {
        return [];
    }
    return is_array($value) ? $value : [];
}

/**
 * Mise à niveau automatique du schéma : crée la table `etablissements`
 * (identification de la société / de l'hôpital) sur les installations
 * existantes qui n'ont pas encore réimporté `reception_salfa.sql`.
 *
 * Aucune donnée n'est écrasée : la table est créée uniquement si elle
 * n'existe pas, et une fiche principale minimale est insérée quand elle est
 * vide (reprise des informations de `parametres_impression` si disponibles).
 */
function reception_salfa_ensure_etablissements_table(PDO $pdo): void
{
    try {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS `etablissements` (
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
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
        );

        $count = (int) $pdo->query('SELECT COUNT(*) FROM `etablissements`')->fetchColumn();
        if ($count > 0) {
            return;
        }

        // Reprise des informations déjà saisies dans les paramètres d'impression.
        $settings = [];
        try {
            $json = $pdo->query("SELECT `data_json` FROM `parametres_impression` WHERE `id` = 'default'")->fetchColumn();
            if (is_string($json) && $json !== '') {
                $settings = reception_salfa_json_decode($json);
            }
        } catch (Throwable $e) {
            $settings = [];
        }

        $name = (string) ($settings['facilityName'] ?? 'Établissement principal');
        $etablissement = [
            'id' => 'etb-principal',
            'code' => 'ETB-001',
            'name' => $name,
            'tradeName' => $name,
            'type' => 'centre_sante',
            'nif' => (string) ($settings['nif'] ?? ''),
            'stat' => '',
            'address' => (string) ($settings['address'] ?? ''),
            'city' => '',
            'country' => 'Madagascar',
            'phone' => (string) ($settings['phone'] ?? ''),
            'email' => (string) ($settings['email'] ?? ''),
            'website' => (string) ($settings['website'] ?? ''),
            'logoUrl' => (string) ($settings['logoUrl'] ?? ''),
            'active' => true,
            'isPrincipal' => true,
        ];

        $stmt = $pdo->prepare(
            'INSERT INTO `etablissements`
                (`id`, `code`, `name`, `trade_name`, `type`, `nif`, `stat`, `numero_agrement`,
                 `city`, `phone`, `email`, `active`, `is_principal`, `data_json`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?)'
        );
        $stmt->execute([
            $etablissement['id'], $etablissement['code'], $etablissement['name'], $etablissement['tradeName'],
            $etablissement['type'], $etablissement['nif'], $etablissement['stat'], '',
            $etablissement['city'], $etablissement['phone'], $etablissement['email'],
            reception_salfa_json_encode($etablissement),
        ]);
    } catch (Throwable $e) {
        // Mise à niveau best-effort : l'API continue de fonctionner même si la
        // création automatique échoue (droits insuffisants, etc.).
        return;
    }
}

/**
 * Mise à niveau automatique du schéma (compatible MySQL ET MariaDB, qui ne
 * supporte pas `ADD COLUMN IF NOT EXISTS`).
 *
 * Ajoute les colonnes tarifaires de la table `articles` (prix d'achat +
 * 3 prix de vente : comptoir / société / externe) lorsqu'elles manquent,
 * afin qu'une installation existante bénéficie des nouvelles colonnes sans
 * réimport manuel du schéma. Identifiants issus d'une liste blanche fixe —
 * aucune chaîne fournie par le navigateur n'est injectée en SQL.
 */
function reception_salfa_ensure_articles_price_columns(PDO $pdo): void
{
    $columns = [
        'prix_achat'    => 'DECIMAL(15,2) NOT NULL DEFAULT 0',
        'prix_comptoir' => 'DECIMAL(15,2) NOT NULL DEFAULT 0',
        'prix_societe'  => 'DECIMAL(15,2) NOT NULL DEFAULT 0',
        'prix_externe'  => 'DECIMAL(15,2) NOT NULL DEFAULT 0',
    ];

    try {
        $stmt = $pdo->prepare(
            'SELECT `COLUMN_NAME` FROM `information_schema`.`COLUMNS`
             WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = ?'
        );
        $stmt->execute(['articles']);
        $existing = array_map('strtolower', $stmt->fetchAll(PDO::FETCH_COLUMN));

        foreach ($columns as $column => $definition) {
            if (in_array(strtolower($column), $existing, true)) {
                continue;
            }
            $pdo->exec('ALTER TABLE `articles` ADD COLUMN `' . $column . '` ' . $definition);
        }
    } catch (Throwable $e) {
        // Mise à niveau best-effort : si la table n'existe pas encore (schéma
        // non importé) ou si l'ALTER échoue, l'API continue de fonctionner.
        return;
    }
}
