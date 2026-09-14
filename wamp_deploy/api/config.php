<?php
/*
 * RECEPTION SALFA — Configuration MySQL (WAMP)
 * ---------------------------------------------------------------
 * Surcharge locale : créez `config.local.php` à côté de ce fichier
 * (même syntaxe, vos valeurs) — il est prioritaire et n'est JAMAIS
 * versionné ni écrasé par `outils/deployer.bat`.
 *
 *   <?php
 *   define('SALFA_DB_PASS', 'mot-de-passe-mysql');
 *   define('SALFA_DEBUG', false);
 */

// Accès direct interdit (ce fichier ne doit servir que via require).
if (basename(isset($_SERVER['SCRIPT_FILENAME']) ? $_SERVER['SCRIPT_FILENAME'] : '') === 'config.php') {
    http_response_code(403);
    exit('Accès refusé.');
}

// 1) Valeurs locales éventuelles (prioritaires).
$__salfa_local = __DIR__ . '/config.local.php';
if (is_file($__salfa_local)) {
    require $__salfa_local;
}

// 2) Valeurs par défaut (WAMP standard).
$__salfa_defaults = array(
    // Connexion MySQL — 127.0.0.1 (évite le bug IPv6 ::1 de WAMP).
    'SALFA_DB_HOST' => '127.0.0.1',
    'SALFA_DB_PORT' => 3306,
    'SALFA_DB_NAME' => 'reception_salfa',
    'SALFA_DB_USER' => 'root',
    'SALFA_DB_PASS' => '',
    // Diagnostic : true = détails techniques renvoyés au client
    // (DÉVELOPPEMENT UNIQUEMENT, jamais en production).
    'SALFA_DEBUG'   => false,
    // Taille maximale acceptée pour un sync_all (Mo). Au-delà : HTTP 413.
    'SALFA_MAX_BODY_MB' => 512,
    // Clé API : si non vide, l'en-tête HTTP X-API-Key devient obligatoire
    // (préparé pour la Phase 1 ; le client actuel ne l'envoie pas : laisser vide).
    'SALFA_API_KEY' => '',
);
foreach ($__salfa_defaults as $__salfa_k => $__salfa_v) {
    if (!defined($__salfa_k)) {
        define($__salfa_k, $__salfa_v);
    }
}
unset($__salfa_local, $__salfa_defaults, $__salfa_k, $__salfa_v);
