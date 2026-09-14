<?php
/*
 * RECEPTION SALFA — Fonctions partagées de l'API MySQL
 * (correspondance datasets ↔ tables, connexion PDO, réponses JSON, journal)
 * Compatible PHP 7.4+.
 */

if (basename(isset($_SERVER['SCRIPT_FILENAME']) ? $_SERVER['SCRIPT_FILENAME'] : '') === 'lib.php') {
    http_response_code(403);
    exit('Accès refusé.');
}

require_once __DIR__ . '/config.php';

// Version de schéma attendue par cette API (table `parametres`, clé `schema_version`).
define('SALFA_SCHEMA_VERSION', 1);

/**
 * Correspondance entre les collections de l'application et les tables MySQL.
 * Les noms de tables SQL ne proviennent JAMAIS de l'entrée utilisateur :
 * seules ces 35 clés sont acceptées.
 */
function salfa_tables() {
    return array(
        'assuranceSocietes'      => 'assurance_societes',
        'assurancePersonnes'     => 'assurance_personnes',
        'assuranceFamilles'      => 'assurance_familles',
        'assurancePrestations'   => 'assurance_prestations',
        'assurancePaiements'     => 'assurance_paiements',
        'patients'               => 'patients',
        'consultations'          => 'consultations',
        'invoices'               => 'factures',
        'ventes'                 => 'ventes',
        'venteLines'             => 'lignes_vente',
        'ventePayments'          => 'paiements_vente',
        'labRequests'            => 'demandes_laboratoire',
        'journey'                => 'parcours_patient',
        'pharmaDeliveryItems'    => 'livraisons_pharmacie',
        'stockEntries'           => 'entrees_stock',
        'stockTransfers'         => 'transferts_stock',
        'stockMovements'         => 'mouvements_stock',
        'movementHeaders'        => 'mouvements_entetes',
        'movementLines'          => 'mouvements_lignes',
        'companyBillingAccounts' => 'comptes_facturation',
        'hbRecords'              => 'dossiers_hospit_bloc',
        'messages'               => 'messages',
        'notifications'          => 'notifications',
        'cashClosings'           => 'clotures_caisse',
        'auditLogs'              => 'journal_audit',
        'inventorySessions'      => 'inventaires',
        'pharmaDeliveryClosings' => 'clotures_pharmacie',
        'users'                  => 'utilisateurs',
        'companies'              => 'societes',
        'articles'               => 'articles',
        'fournisseurs'           => 'fournisseurs',
        'familles'               => 'familles',
        'labCatalog'             => 'catalogue_laboratoire',
        'warehouseServices'      => 'services_depot',
        'etablissements'         => 'etablissements',
    );
}

/** Clés JSON stockées dans la table `parametres`. */
function salfa_param_keys() {
    return array('ticketSettings', 'monthlyInvoices', 'issuedFactureNumbers', 'prescripteursExternes');
}

/** Clés numériques stockées dans la table `compteurs` (ne diminuent jamais). */
function salfa_counter_keys() {
    return array('factureCounter', 'pharmaClosingCounter');
}

/** Connexion PDO unique (erreurs en exceptions, utf8mb4, requêtes préparées réelles). */
function salfa_pdo() {
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $dsn = 'mysql:host=' . SALFA_DB_HOST . ';port=' . (int) SALFA_DB_PORT
         . ';dbname=' . SALFA_DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, SALFA_DB_USER, SALFA_DB_PASS, array(
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ));
    return $pdo;
}

/** Envoie une réponse JSON et termine le script. */
function salfa_repondre($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Envoie une erreur JSON (détails techniques journalisés, jamais exposés sauf DEBUG). */
function salfa_erreur($message, $code = 400, $detail = null) {
    $out = array('success' => false, 'error' => $message);
    if (SALFA_DEBUG && $detail !== null) {
        $out['detail'] = (string) $detail;
    }
    salfa_log('ERREUR ' . $code . ' — ' . $message
        . ($detail !== null ? ' | ' . substr((string) $detail, 0, 500) : ''));
    salfa_repondre($out, $code);
}

/** Journal local : api/logs/api-AAAA-MM-JJ.log (jamais accessible via HTTP). */
function salfa_log($message) {
    try {
        $dir = __DIR__ . '/logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        @file_put_contents(
            $dir . '/api-' . date('Y-m-d') . '.log',
            '[' . date('Y-m-d H:i:s') . '] ' . $message . PHP_EOL,
            FILE_APPEND
        );
    } catch (Exception $e) {
        // Le journal ne doit jamais casser l'API.
    }
}

/** Contrôle optionnel de la clé API (Phase 1 — inactif si SALFA_API_KEY vide). */
function salfa_verifier_cle() {
    if (SALFA_API_KEY === '') {
        return;
    }
    $recue = isset($_SERVER['HTTP_X_API_KEY']) ? (string) $_SERVER['HTTP_X_API_KEY'] : '';
    if (!hash_equals((string) SALFA_API_KEY, $recue)) {
        salfa_erreur('Clé API manquante ou invalide.', 401);
    }
}

/** Un identifiant d'enregistrement valide : chaîne courte, caractères sûrs. */
function salfa_id_valide($id) {
    return is_string($id) && $id !== '' && strlen($id) <= 64
        && preg_match('/^[A-Za-z0-9_\\.\\-@ ]+$/', $id) === 1;
}
