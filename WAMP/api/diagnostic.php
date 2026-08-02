<?php
/**
 * Diagnostic d'installation — RECEPTION SALFA (WAMP / MySQL).
 * Ouvre cette page dans le navigateur pour vérifier en un coup d'œil :
 *   1. la connexion MySQL (hôte 127.0.0.1, port 3306, base reception_salfa) ;
 *   2. la présence de toutes les tables normalisées du schéma ;
 *   3. quelques compteurs de données (patients, ventes, articles...).
 */

declare(strict_types=1);

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/datasets.php';

header('Content-Type: text/html; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

$ok = false;
$message = '';
$details = [];
$missing = [];

try {
    $config = require __DIR__ . '/config.php';
    $pdo = reception_salfa_database($config);

    $datasets = reception_salfa_datasets();
    $expected = [];
    foreach ($datasets as $dataset) {
        if ($dataset['type'] !== 'counter') {
            $expected[] = $dataset['table'];
        }
    }
    // + table des compteurs, non référencée comme « collection »
    $expected[] = 'compteurs';
    $expected = array_values(array_unique($expected));

    $found = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    $missing = array_values(array_diff($expected, $found));

    if (count($missing) > 0) {
        $message = 'Connexion MySQL réussie, mais des tables manquent : importez database/reception_salfa.sql.';
    } else {
        $ok = true;
        $message = 'Connexion MySQL réussie. La base normalisée reception_salfa est prête.';
    }

    $details[] = 'Base : ' . $config['database'] . ' (hôte ' . $config['host'] . ':' . $config['port'] . ')';
    $details[] = 'Tables présentes : ' . count($found) . ' / ' . count($expected);

    $count = static function (string $table) use ($pdo): int {
        try {
            return (int) $pdo->query('SELECT COUNT(*) FROM `' . $table . '`')->fetchColumn();
        } catch (Throwable $e) {
            return 0;
        }
    };

    $details[] = 'Patients : ' . $count('patients');
    $details[] = 'Consultations : ' . $count('consultations');
    $details[] = 'Ventes : ' . $count('ventes');
    $details[] = 'Articles : ' . $count('articles');
    $details[] = 'Utilisateurs : ' . $count('utilisateurs');
    $details[] = 'Compteurs : ' . $count('compteurs');
} catch (Throwable $error) {
    $message = 'Connexion MySQL impossible. Vérifiez que WAMP (MySQL) est démarré, '
        . 'que la base reception_salfa existe et que api/config.php est correct.';
    if (!empty($config['debug'])) {
        $details[] = 'Détail technique : ' . $error->getMessage();
    }
}

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Diagnostic MySQL — RECEPTION SALFA</title>
  <style>
    body{font-family:Arial,sans-serif;background:#f0f5fb;color:#172033;margin:0;padding:32px}
    .card{max-width:720px;margin:40px auto;background:#fff;border-radius:18px;padding:28px;box-shadow:0 12px 35px rgba(13,71,161,.12)}
    h1{color:#0d47a1;margin-top:0}
    .status{padding:16px;border-radius:12px;font-weight:700;background:#fff0f0;color:#a51f1f}
    .status.ok{background:#e8f7ee;color:#18733b}
    li{margin:8px 0}
    a{color:#0d47a1;font-weight:700}
    .warn{color:#a51f1f}
    code{background:#eef2f7;padding:2px 6px;border-radius:6px}
  </style>
</head>
<body>
  <main class="card">
    <h1>Diagnostic MySQL — RECEPTION SALFA</h1>
    <p class="status<?= $ok ? ' ok' : '' ?>"><?= h($message) ?></p>

    <?php if (count($missing) > 0): ?>
      <p class="warn">Tables manquantes :</p>
      <ul><?php foreach ($missing as $table): ?><li><code><?= h($table) ?></code></li><?php endforeach; ?></ul>
      <p>Importez <code>database/reception_salfa.sql</code> dans phpMyAdmin, puis rechargez cette page.</p>
    <?php endif; ?>

    <?php if (count($details) > 0): ?>
      <ul><?php foreach ($details as $detail): ?><li><?= h($detail) ?></li><?php endforeach; ?></ul>
    <?php endif; ?>

    <p><a href="../">Ouvrir RECEPTION SALFA</a> — <a href="index.php?action=health">Santé API (JSON)</a></p>
  </main>
</body>
</html>
