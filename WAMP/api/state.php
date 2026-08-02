<?php
require_once __DIR__ . '/../config/db_config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function respond($payload, int $code = 200): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function ensureStateTable(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS salfa_app_state (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        state_json LONGTEXT NOT NULL CHECK (JSON_VALID(state_json)),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

try {
    $pdo = getDatabaseConnection();
    ensureStateTable($pdo);
} catch (Throwable $e) {
    respond([
        'success' => false,
        'message' => 'Base de données indisponible',
        'error' => APP_DEBUG ? $e->getMessage() : null,
    ], 503);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $stmt = $pdo->prepare("SELECT state_json, updated_at FROM salfa_app_state WHERE id = 'default'");
    $stmt->execute();
    $row = $stmt->fetch();

    if (!$row) {
        respond([
            'success' => false,
            'message' => "Aucun état initial trouvé. Importez database/import_wamp_state.sql ou envoyez un PUT sur cette URL.",
            'state' => null,
        ], 404);
    }

    respond([
        'success' => true,
        'updatedAt' => $row['updated_at'],
        'state' => json_decode($row['state_json'], true),
    ]);
}

if ($method === 'PUT' || $method === 'POST') {
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw, true);

    if (!is_array($payload)) {
        respond(['success' => false, 'message' => 'JSON invalide.'], 400);
    }

    $state = array_key_exists('state', $payload) ? $payload['state'] : $payload;
    $stateJson = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

    if ($stateJson === false) {
        respond(['success' => false, 'message' => "Impossible d'encoder l'état."], 400);
    }

    $stmt = $pdo->prepare("INSERT INTO salfa_app_state (id, state_json)
        VALUES ('default', :state_json)
        ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), updated_at = CURRENT_TIMESTAMP");
    $stmt->execute(['state_json' => $stateJson]);

    respond(['success' => true, 'message' => 'État enregistré côté WAMP/MySQL.']);
}

respond(['success' => false, 'message' => 'Méthode HTTP non autorisée.'], 405);
