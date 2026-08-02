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
