<?php
/**
 * API d'état MySQL — RECEPTION SALFA (version WAMP normalisée)
 * ============================================================
 * Toutes les données de l'application compilée (WAMP/index.html) sont stockées
 * dans MySQL dans des tables normalisées (UNE table par entité : patients,
 * ventes, articles, ...). Ce script expose deux points d'entrée :
 *
 *   GET  index.php?action=read_all   → renvoie TOUTES les collections (l'app
 *                                      reconstitue son état complet au démarrage)
 *   POST index.php?action=sync_all   → enregistre TOUTES les collections fournies
 *                                      (l'app sauvegarde automatiquement chaque
 *                                      modification dans les tables normalisées)
 *   GET  index.php?action=health     → état de la liaison MySQL (JSON)
 *   GET  index.php?action=read&ds=patients   → lecture d'une seule collection
 *   POST index.php?action=sync&ds=patients   → écriture d'une seule collection
 *
 * L'échange est en JSON. La connexion MySQL est établie via `127.0.0.1`
 * (voir config.php) et toutes les requêtes sont préparées (PDO).
 */

declare(strict_types=1);

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/datasets.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

function salfa_respond(array $payload, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

/** Lit une valeur par chemin de points (ex: 'facilityName') dans un objet. */
function salfa_extract(array $row, string $path)
{
    $parts = explode('.', $path);
    $current = $row;
    foreach ($parts as $part) {
        if (!is_array($current) || !array_key_exists($part, $current)) {
            return null;
        }
        $current = $current[$part];
    }
    return $current;
}

/** Convertit une valeur extraite pour insertion SQL (booléen → 0/1, num → nombre). */
function salfa_cast_value($value)
{
    if ($value === null) {
        return null;
    }
    if (is_bool($value)) {
        return $value ? 1 : 0;
    }
    return (string) $value;
}

/** Données normalisées d'une collection → lignes prêtes pour l'insertion. */
function salfa_prepare_rows(array $rows, array $dataset): array
{
    $prepared = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $id = (string) ($row['id'] ?? '');
        if ($id === '') {
            continue;
        }
        $dbRow = ['id' => $id, 'data_json' => reception_salfa_json_encode($row)];
        foreach ($dataset['columns'] as $column => $path) {
            $dbRow[$column] = salfa_cast_value(salfa_extract($row, $path));
        }
        $prepared[] = $dbRow;
    }
    return $prepared;
}

function salfa_read_collection(PDO $pdo, array $dataset): ?array
{
    if ($dataset['type'] === 'counter') {
        $stmt = $pdo->prepare('SELECT `value` FROM `' . $dataset['table'] . '` WHERE `id` = ?');
        $stmt->execute([$dataset['counter_id']]);
        $value = $stmt->fetchColumn();
        return $value === false ? 0 : (int) $value;
    }

    $stmt = $pdo->query('SELECT `id`, `data_json` FROM `' . $dataset['table'] . '`');
    $rows = $stmt->fetchAll();

    if ($dataset['type'] === 'single') {
        foreach ($rows as $row) {
            if ($row['id'] === 'default') {
                return reception_salfa_json_decode((string) $row['data_json']);
            }
        }
        return null;
    }

    return array_map(
        static function (array $row): array {
            return reception_salfa_json_decode((string) $row['data_json']);
        },
        $rows
    );
}

function salfa_write_collection(PDO $pdo, array $dataset, $incoming): void
{
    if ($dataset['type'] === 'counter') {
        $value = is_numeric($incoming) ? (int) $incoming : 0;
        $stmt = $pdo->prepare(
            'INSERT INTO `' . $dataset['table'] . '` (`id`, `value`) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)'
        );
        $stmt->execute([$dataset['counter_id'], $value]);
        return;
    }

    // On remplace intégralement la collection : l'application envoie TOUJOURS
    // l'état complet de la collection à chaque sauvegarde (source unique de vérité).
    $pdo->exec('DELETE FROM `' . $dataset['table'] . '`');

    if ($dataset['type'] === 'single') {
        if (!is_array($incoming)) {
            return;
        }
        // Ligne unique stockée sous l'id 'default' (le client envoie l'objet nu)
        $rows = salfa_prepare_rows([array_merge($incoming, ['id' => 'default'])], $dataset);
    } else {
        $rows = salfa_prepare_rows(is_array($incoming) ? $incoming : [], $dataset);
    }

    foreach ($rows as $dbRow) {
        $columns = array_keys($dbRow);
        $quoted = array_map(static function (string $c): string { return '`' . $c . '`'; }, $columns);
        $placeholders = implode(', ', array_fill(0, count($columns), '?'));
        $sql = 'INSERT INTO `' . $dataset['table'] . '` (' . implode(', ', $quoted) . ') VALUES (' . $placeholders . ')';
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_values($dbRow));
    }
}

$action = $_GET['action'] ?? '';

try {
    $config = require __DIR__ . '/config.php';
    $pdo = reception_salfa_database($config);
    $datasets = reception_salfa_datasets();
} catch (Throwable $e) {
    salfa_respond([
        'success' => false,
        'message' => 'Base de données indisponible. Vérifiez WAMP (MySQL) et importez database/reception_salfa.sql.',
        'error' => $e->getMessage(),
    ], 503);
}

try {

if ($action === 'health') {
    salfa_respond([
        'success' => true,
        'app' => 'RECEPTION SALFA',
        'database' => $config['database'],
        'host' => $config['host'],
        'php' => PHP_VERSION,
        'time' => date('c'),
    ]);
}

if ($action === 'read_all') {
    $result = [];
    foreach ($datasets as $name => $dataset) {
        $result[$name] = salfa_read_collection($pdo, $dataset);
    }
    salfa_respond(['success' => true, 'datasets' => $result]);
}

if ($action === 'read') {
    $name = (string) ($_GET['ds'] ?? '');
    if (!isset($datasets[$name])) {
        salfa_respond(['success' => false, 'message' => 'Collection inconnue.'], 400);
    }
    salfa_respond(['success' => true, 'dataset' => $name, 'data' => salfa_read_collection($pdo, $datasets[$name])]);
}

if ($action === 'sync_all') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if (!is_array($payload) || !isset($payload['datasets']) || !is_array($payload['datasets'])) {
        salfa_respond(['success' => false, 'message' => 'Payload JSON invalide (attendu : {"datasets":{...}}).'], 400);
    }

    $pdo->beginTransaction();
    try {
        foreach ($payload['datasets'] as $name => $data) {
            if (!isset($datasets[$name])) {
                continue; // collection inconnue → ignorée silencieusement
            }
            salfa_write_collection($pdo, $datasets[$name], $data);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        $message = 'Erreur MySQL lors de l\'enregistrement. Vérifiez la base reception_salfa et le schéma.';
        if (!empty($config['debug'])) {
            $message .= ' Détail : ' . $e->getMessage();
        }
        salfa_respond(['success' => false, 'message' => $message], 500);
    }

    salfa_respond(['success' => true, 'message' => 'Données enregistrées dans les tables MySQL normalisées.']);
}

if ($action === 'sync') {
    $name = (string) ($_GET['ds'] ?? '');
    if (!isset($datasets[$name])) {
        salfa_respond(['success' => false, 'message' => 'Collection inconnue.'], 400);
    }
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        salfa_respond(['success' => false, 'message' => 'Payload JSON invalide.'], 400);
    }
    $data = array_key_exists('data', $payload) ? $payload['data'] : $payload;
    salfa_write_collection($pdo, $datasets[$name], $data);
    salfa_respond(['success' => true, 'message' => 'Collection enregistrée.']);
}

salfa_respond([
    'success' => false,
    'message' => 'Action API inconnue. Utilisez ?action=read_all, ?action=sync_all, ?action=health, ?action=read&ds=..., ?action=sync&ds=...',
], 400);

} catch (Throwable $e) {
    // Erreur SQL non gérée (ex. schéma non importé, table manquante) : réponse JSON propre.
    $message = 'Erreur MySQL. Vérifiez que vous avez importé database/reception_salfa.sql et que WAMP (MySQL) est démarré.';
    if (!empty($config['debug'])) {
        $message .= ' Détail : ' . $e->getMessage();
    }
    salfa_respond(['success' => false, 'message' => $message], 500);
}
