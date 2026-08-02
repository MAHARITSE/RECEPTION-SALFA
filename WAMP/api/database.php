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
