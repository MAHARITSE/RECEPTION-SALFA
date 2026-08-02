<?php
require_once __DIR__ . '/../config/db_config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$status = [
    'app' => APP_NAME,
    'version' => APP_VERSION,
    'php' => PHP_VERSION,
    'time' => date('c'),
    'database' => [
        'host' => DB_HOST,
        'name' => DB_NAME,
        'connected' => false,
        'error' => null,
    ],
];

try {
    $pdo = getDatabaseConnection();
    $pdo->query('SELECT 1');
    $status['database']['connected'] = true;
} catch (Throwable $e) {
    http_response_code(503);
    $status['database']['error'] = APP_DEBUG ? $e->getMessage() : 'Connexion impossible';
}

echo json_encode($status, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
