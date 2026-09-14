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
// v2 : table `sequences` (numérotation atomique multi-caisses) —
// cf. wamp_deploy/database/migrations/002_sequences.sql.
define('SALFA_SCHEMA_VERSION', 2);

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

/** Plus grand ordre déjà émis pour une période, dans une liste de numéros.
 *  Miroir exact de nextDailySequence / nextSocieteSequence (src/utils/factureNumber.ts) :
 *   - standard (période AAMMJJ) : ^YYFAMMDD(ordre)$ ;
 *   - société (période AAMM) : ^FA-MM/CODE/YY-(ordre)$, séquence GLOBALE du mois
 *     toutes sociétés confondues (le code ne compte pas).
 *  Utilisé UNIQUEMENT pour amorcer une période inédite ; ensuite, incrément O(1). */
function salfa_max_ordre_periode($numeros, $kind, $periode) {
    $max = 0;
    if ($kind === 'standard') {
        $re = '/^' . substr($periode, 0, 2) . 'FA' . substr($periode, 2, 4) . '(\d{3,})$/';
    } else {
        $re = '/^FA-' . substr($periode, 2, 2) . '\/[A-Z0-9]{1,10}\/' . substr($periode, 0, 2) . '-(\d{3,})$/';
    }
    if (!is_array($numeros)) {
        return 0;
    }
    foreach ($numeros as $n) {
        if (!is_string($n)) {
            continue;
        }
        if (preg_match($re, strtoupper(trim($n)), $m) === 1) {
            $v = (int) $m[1];
            if ($v > $max) {
                $max = $v;
            }
        }
    }
    return $max;
}

/** Plus grand ordre déjà émis pour une période, dans les tables MySQL
 *  (couvre les numéros émis par d'AUTRES postes et pas encore synchronisés
 *  sur le poste demandeur). Balayage indexé (`idx_numero`), une fois par
 *  période inédite seulement. */
function salfa_max_ordre_base($pdo, $kind, $periode) {
    if ($kind === 'standard') {
        $like = substr($periode, 0, 2) . 'FA' . substr($periode, 2, 4) . '%';
    } else {
        $like = 'FA-' . substr($periode, 2, 2) . '/%/' . substr($periode, 0, 2) . '-%';
    }
    $refs = array();
    // Tables fermées (jamais d'entrée utilisateur) portant des numéros de facture.
    $tables = array('factures', 'ventes', 'dossiers_hospit_bloc', 'assurance_prestations');
    foreach ($tables as $t) {
        $stmt = $pdo->prepare('SELECT `numero_ref` FROM `' . $t . '` WHERE `numero_ref` LIKE :like');
        $stmt->execute(array(':like' => $like));
        while (($ref = $stmt->fetchColumn()) !== false) {
            $refs[] = $ref;
        }
        $stmt->closeCursor();
        unset($stmt);
    }
    // Registre des numéros retirés (renumérotations : jamais de réutilisation).
    $stmt = $pdo->query("SELECT `valeur` FROM `parametres` WHERE `cle` = 'issuedFactureNumbers' LIMIT 1");
    $row = $stmt ? $stmt->fetch() : false;
    if ($row && isset($row['valeur'])) {
        $liste = json_decode($row['valeur'], true);
        if (is_array($liste)) {
            foreach ($liste as $n) {
                $refs[] = $n;
            }
        }
    }
    return salfa_max_ordre_periode($refs, $kind, $periode);
}

/** Empreinte SHA-256 calculée par le client (miroir de src/utils/motDePasse.ts). */
function salfa_sha256_mot_de_passe($clair) {
    return 'sha256:' . hash('sha256', 'salfa-his-v1:' . $clair);
}

/** Vrai si la valeur stockée est déjà un hachage serveur (password_hash). */
function salfa_est_hache_serveur($valeur) {
    if (!is_string($valeur) || strlen($valeur) < 20) {
        return false;
    }
    return strpos($valeur, '$2y$') === 0 || strpos($valeur, '$2a$') === 0
        || strpos($valeur, '$2b$') === 0 || strpos($valeur, '$argon2') === 0;
}

/**
 * Vérifie un mot de passe saisi contre la valeur stockée (bcrypt serveur,
 * empreinte `sha256:` du client, ou historique en clair).
 * Retourne array(ok, nouveau_stockage) : tout stockage non-bcrypt VALIDÉ est
 * migré vers bcrypt (migration paresseuse, transparente pour l'utilisateur).
 */
function salfa_verifier_mot_de_passe($saisi, $stocke) {
    if (!is_string($saisi) || $saisi === '' || !is_string($stocke) || $stocke === '') {
        return array(false, null);
    }
    if (salfa_est_hache_serveur($stocke)) {
        if (!password_verify($saisi, $stocke)) {
            return array(false, null);
        }
        $rehache = password_needs_rehash($stocke, PASSWORD_BCRYPT)
            ? password_hash($saisi, PASSWORD_BCRYPT) : null;
        return array(true, $rehache);
    }
    if (strpos($stocke, 'sha256:') === 0) {
        if (!hash_equals($stocke, salfa_sha256_mot_de_passe($saisi))) {
            return array(false, null);
        }
        return array(true, password_hash($saisi, PASSWORD_BCRYPT));
    }
    // Historique en clair (seed, anciennes bases) : accepté une fois puis bcrypt.
    if (!hash_equals($stocke, $saisi)) {
        return array(false, null);
    }
    return array(true, password_hash($saisi, PASSWORD_BCRYPT));
}

/**
 * Normalise le mot de passe d'une ligne `users` reçue par sync_all.
 * RÈGLE : les lectures (read_all) ne transmettent JAMAIS les mots de passe,
 * donc un poste ne peut pas en renvoyer un à jour — tout mot de passe déjà
 * en base est PRÉSERVÉ (champ entrant ignoré). Seule exception : la CRÉATION
 * d'un compte (aucune ligne en base), où l'initial est accepté (bcrypté si
 * clair, conservé si déjà haché). Les CHANGEMENTS passent par action=password.
 * Retourne la ligne corrigée.
 */
function salfa_normaliser_mot_de_passe($pdo, $ligne) {
    $id = isset($ligne['id']) ? $ligne['id'] : '';
    $existant = null;
    try {
        $stmt = $pdo->prepare('SELECT `donnees` FROM `utilisateurs` WHERE `id` = :id LIMIT 1');
        $stmt->execute(array(':id' => $id));
        $row = $stmt->fetch();
        if ($row && isset($row['donnees'])) {
            $obj = json_decode($row['donnees'], true);
            if (is_array($obj) && isset($obj['password']) && is_string($obj['password']) && $obj['password'] !== '') {
                $existant = $obj['password'];
            }
        }
    } catch (Exception $e) {
        // Base illisible : on conserve la ligne telle quelle (l'écriture
        // échouera proprement ensuite si la base est vraiment injoignable).
    }
    if ($existant !== null) {
        $ligne['password'] = $existant;
        return $ligne;
    }
    // Création de compte : pas de mot de passe en base.
    $mdp = isset($ligne['password']) ? $ligne['password'] : null;
    if (!is_string($mdp) || $mdp === '') {
        unset($ligne['password']); // sera défini via action=password
        return $ligne;
    }
    if (salfa_est_hache_serveur($mdp) || strpos($mdp, 'sha256:') === 0) {
        return $ligne; // déjà haché : conservé (vérifiable au login)
    }
    $ligne['password'] = password_hash($mdp, PASSWORD_BCRYPT);
    return $ligne;
}

/**
 * Exige un jeton de session valide (en-tête X-Session-Token, paramètre
 * ?token= ou champ `token` du corps — ce dernier pour sendBeacon, qui ne
 * peut pas poser d'en-tête). Répond 401 et termine sinon.
 * Retourne array('id' => identifiant, 'role' => rôle principal).
 */
function salfa_session_exige($pdo, $corps = null) {
    $jeton = '';
    if (isset($_SERVER['HTTP_X_SESSION_TOKEN']) && is_string($_SERVER['HTTP_X_SESSION_TOKEN'])) {
        $jeton = trim($_SERVER['HTTP_X_SESSION_TOKEN']);
    }
    if ($jeton === '' && isset($_GET['token']) && is_string($_GET['token'])) {
        $jeton = trim($_GET['token']);
    }
    if ($jeton === '' && is_array($corps) && isset($corps['token']) && is_string($corps['token'])) {
        $jeton = trim($corps['token']);
    }
    if (preg_match('/^[0-9a-f]{64}$/', $jeton) !== 1) {
        salfa_erreur('Session requise : reconnectez-vous.', 401);
    }
    try {
        $stmt = $pdo->prepare('SELECT `utilisateur_id`, `role`, `expire_le` FROM `sessions` WHERE `jeton` = :j LIMIT 1');
        $stmt->execute(array(':j' => $jeton));
        $row = $stmt->fetch();
    } catch (Exception $e) {
        salfa_erreur('Vérification de session impossible (migration 002 appliquée ?).', 500, $e->getMessage());
    }
    if (!$row || strtotime((string) $row['expire_le']) <= time()) {
        try {
            $del = $pdo->prepare('DELETE FROM `sessions` WHERE `jeton` = :j');
            $del->execute(array(':j' => $jeton));
        } catch (Exception $e) {
            // Nettoyage accessoire : l'échec ne change pas la réponse 401.
        }
        salfa_erreur('Session expirée : reconnectez-vous.', 401);
    }
    return array('id' => $row['utilisateur_id'], 'role' => $row['role']);
}

/** Un identifiant d'enregistrement valide : chaîne courte, caractères sûrs. */
function salfa_id_valide($id) {
    return is_string($id) && $id !== '' && strlen($id) <= 64
        && preg_match('/^[A-Za-z0-9_\\.\\-@ ]+$/', $id) === 1;
}
