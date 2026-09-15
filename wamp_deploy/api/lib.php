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
//      cf. wamp_deploy/database/migrations/002_sequences.sql.
// v3 : table `revision` (poll léger + if_rev) et index `idx_maj` —
//      cf. wamp_deploy/database/migrations/003_performance.sql.
//      Sans v3, l'API reste fonctionnelle : le client retombe sur la relecture
//      complète toutes les 5 s (comportement de la v2).
define('SALFA_SCHEMA_VERSION', 3);

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

/* ---------------------------------------------------------------------------
 *  LIMITES & RÉVISION D'ÉTAT (ajoutés par l'audit « 100 patients/jour »)
 * ------------------------------------------------------------------------- */

/** Limite de corps réellement applicable : le plus petit entre la config
 *  applicative et ce que PHP peut absorber (sinon la requête meurt en
 *  erreur 500 opaque au lieu d'un 413 explicite). */
function salfa_limite_corps() {
    $config = (int) SALFA_MAX_BODY_MB * 1048576;
    $memo = 0; // memory_limit (-1 = illimité)
    $ml = trim((string) ini_get('memory_limit'));
    if ($ml !== '' && $ml !== '-1') {
        $n = (float) $ml;
        $u = strtolower(substr($ml, -1));
        if ($u === 'g') { $n *= 1073741824; } elseif ($u === 'm') { $n *= 1048576; } elseif ($u === 'k') { $n *= 1024; }
        $memo = (int) $n;
    }
    $limite = $config;
    // Un json_decode coûte ~4 à 5 fois la taille du texte : on ne garde que
    // le cinquième de memory_limit comme plafond de corps.
    if ($memo > 0) { $limite = min($limite, (int) ($memo / 5)); }
    // post_max_size N'EST PAS inclus : l'API lit le corps brut (`php://input`),
    // que cette limite ne borne pas (elle ne concerne que le remplissage de
    // $_POST). La mentionner dans le message d'erreur reste utile à
    // l'administrateur, qui importera aussi des fichiers via phpMyAdmin.
    return $limite > 0 ? $limite : $config;
}

/** Le serveur peut-il suivre la révision d'état (migration 003 appliquée) ? */
function salfa_revision_disponible($pdo) {
    static $ok = null;
    if ($ok !== null) { return $ok; }
    try {
        $pdo->query('SELECT 1 FROM `revision` LIMIT 1');
        $ok = true;
    } catch (Exception $e) {
        $ok = false;
    }
    return $ok;
}

/** Révision courante de la base (null si la table `revision` est absente). */
function salfa_revision_lire($pdo) {
    if (!salfa_revision_disponible($pdo)) { return null; }
    try {
        $row = $pdo->query('SELECT `rev` FROM `revision` WHERE `id` = 1')->fetch();
        return $row ? (int) $row['rev'] : 0;
    } catch (Exception $e) {
        return null;
    }
}

/** Révision courante SOUS VERROU (pour le contrôle d'anti-écrasement `if_rev`) :
 *  toutes les écritures incrémentant la révision dans leur transaction, la
 *  comparaison est faite sur une valeur que personne ne peut bouger entre-temps.
 *  Coût : les sauvegardes des postes sont sérialisées sur cette ligne — quelques
 *  millisecondes chacune, très au-dessus du besoin à 100 passages/jour.
 *  Retourne `null` si la table `revision` est absente (le client retombe alors
 *  sur le comportement sans contrôle). */
function salfa_revision_verrou($pdo) {
    if (!salfa_revision_disponible($pdo)) { return null; }
    try {
        $row = $pdo->query('SELECT `rev` FROM `revision` WHERE `id` = 1 FOR UPDATE')->fetch();
        return $row ? (int) $row['rev'] : 0;
    } catch (Exception $e) {
        return null;
    }
}

/** Marque une modification de la base (utilisé par le rafraîchissement léger). */
function salfa_revision_marquer($pdo, $increment = 1) {
    if (!salfa_revision_disponible($pdo)) { return; }
    try {
        $stmt = $pdo->prepare('INSERT INTO `revision` (`id`, `rev`) VALUES (1, :i)'
            . ' ON DUPLICATE KEY UPDATE `rev` = `rev` + :i2, `mis_a_jour` = CURRENT_TIMESTAMP');
        $stmt->execute(array(':i' => (int) $increment, ':i2' => (int) $increment));
    } catch (Exception $e) {
        // La révision est un accélérateur : son échec ne bloque jamais l'écriture.
    }
}

/** Vrai si la session porte le rôle administrateur (rôle principal ou délégué). */
function salfa_est_admin($session) {
    if (!is_array($session)) { return false; }
    if (isset($session['role']) && (string) $session['role'] === 'admin') { return true; }
    return isset($session['roles']) && is_array($session['roles']) && in_array('admin', $session['roles'], true);
}

/** Vrai si le poste est administrateur. Le jeton ne porte que le rôle
 *  principal : à défaut, on relit les rôles délégués en base (une requête
 *  sur clé primaire, uniquement quand c'est nécessaire). */
function salfa_session_est_admin($pdo, $session) {
    if (salfa_est_admin($session)) { return true; }
    if (!is_array($session) || !isset($session['id'])) { return false; }
    try {
        $stmt = $pdo->prepare('SELECT `donnees` FROM `utilisateurs` WHERE `id` = :id LIMIT 1');
        $stmt->execute(array(':id' => $session['id']));
        $row = $stmt->fetch();
        $obj = ($row && isset($row['donnees'])) ? json_decode($row['donnees'], true) : null;
        if (is_array($obj)) { return salfa_est_admin($obj); }
    } catch (Exception $e) {
        // Base illisible : on en reste au rôle du jeton.
    }
    return false;
}

/** Écritures refusées si un poste non administrateur touche au dataset
 *  `utilisateurs` (comptes et rôles) — sauf tant que la table est vide
 *  (initialisation de la toute première base). Retourne les lignes autorisées. */
function salfa_filtrer_utilisateurs($pdo, $lignes, $session, $est_admin) {
    if (!is_array($lignes) || count($lignes) === 0) { return is_array($lignes) ? $lignes : array(); }
    if ($est_admin) { return $lignes; }
    $base_vierge = false;
    try {
        $base_vierge = ((int) $pdo->query('SELECT COUNT(*) FROM `utilisateurs`')->fetchColumn()) === 0;
    } catch (Exception $e) {
        $base_vierge = true; // table illisible : on ne bloque pas davantage
    }
    if ($base_vierge) { return $lignes; }
    salfa_log('REFUS — dataset `utilisateurs` ignoré (compte non administrateur : '
        . (isset($session['id']) ? $session['id'] : '?') . ').');
    return array(); // ignoré, mais la sauvegarde des autres datasets aboutit
}

/** Anti- brute-force : compteur d'échecs par (compte, IP), sur disque
 *  (aucune table à créer, survit aux redémarrages d'Apache).
 *  Retourne array(bloque, secondes_restantes). */
function salfa_essais_consulter($cle) {
    $f = salfa_fichier_essais();
    if ($f === null) { return array(false, 0); }
    $data = @file_get_contents($f);
    if (!is_string($data) || $data === '') { return array(false, 0); }
    $tab = @json_decode($data, true);
    if (!is_array($tab) || !isset($tab[$cle])) { return array(false, 0); }
    $entree = $tab[$cle];
    $t = isset($entree['t']) ? (int) $entree['t'] : 0;
    $n = isset($entree['n']) ? (int) $entree['n'] : 0;
    $duree = 15 * 60;
    if ($n >= 5) {
        $reste = $t + $duree - time();
        if ($reste > 0) { return array(true, $reste); }
        return array(false, 0);
    }
    // Fenêtre glissante de 10 minutes.
    if (time() - $t > 600) { return array(false, 0); }
    return array(false, 0);
}

/** Enregistre un échec (ou réinitialise le compteur sur succès). */
function salfa_essais_enregistrer($cle, $reussi) {
    $f = salfa_fichier_essais();
    if ($f === null) { return; }
    $tab = array();
    $data = @file_get_contents($f);
    if (is_string($data) && $data !== '') {
        $lu = @json_decode($data, true);
        if (is_array($lu)) { $tab = $lu; }
    }
    if ($reussi) {
        unset($tab[$cle]);
    } else {
        $n = 1;
        if (isset($tab[$cle]) && is_array($tab[$cle])) {
            if (time() - (int) $tab[$cle]['t'] <= 600) { $n = (int) $tab[$cle]['n'] + 1; }
        }
        $tab[$cle] = array('n' => $n, 't' => time());
    }
    // On purge les entrées anciennes pour que le fichier reste petit.
    foreach ($tab as $k => $v) {
        if (!is_array($v) || !isset($v['t']) || time() - (int) $v['t'] > 3600) { unset($tab[$k]); }
    }
    @file_put_contents($f, json_encode($tab), LOCK_EX);
}

/** Emplacement du compteur d'échecs de connexion (dossier des journaux). */
function salfa_fichier_essais() {
    $dir = __DIR__ . '/logs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return is_dir($dir) && is_writable($dir) ? $dir . '/essais.json' : null;
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
 * Exige un jeton de session valide (en-tête X-Session-Token ou champ `token`
 * du corps — ce dernier pour sendBeacon, qui ne peut pas poser d'en-tête).
 * Répond 401 et termine sinon.
 * Le jeton n'est PLUS accepté en paramètre d'URL : il se serait retrouvé dans
 * les journaux Apache (access.log) et le referer, donc dans la nature.
 * Retourne array('id' => identifiant, 'role' => rôle principal).
 */
function salfa_session_exige($pdo, $corps = null) {
    $jeton = '';
    if (isset($_SERVER['HTTP_X_SESSION_TOKEN']) && is_string($_SERVER['HTTP_X_SESSION_TOKEN'])) {
        $jeton = trim($_SERVER['HTTP_X_SESSION_TOKEN']);
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
    // Le compte doit toujours exister : un jeton ne survit pas à la
    // suppression (ou au retrait) du compte qui l'a reçu.
    try {
        $u = $pdo->prepare('SELECT 1 FROM `utilisateurs` WHERE `id` = :id LIMIT 1');
        $u->execute(array(':id' => $row['utilisateur_id']));
        if (!$u->fetchColumn()) {
            $del = $pdo->prepare('DELETE FROM `sessions` WHERE `jeton` = :j');
            $del->execute(array(':j' => $jeton));
            salfa_erreur('Compte supprimé ou désactivé : reconnectez-vous.', 401);
        }
    } catch (Exception $e) {
        if ($e instanceof PDOException) {
            // Table `utilisateurs` illisible : on ne bloque pas l'accès.
        } else {
            throw $e;
        }
    }
    return array('id' => $row['utilisateur_id'], 'role' => $row['role']);
}

/** Un identifiant d'enregistrement valide : chaîne courte, caractères sûrs. */
function salfa_id_valide($id) {
    return is_string($id) && $id !== '' && strlen($id) <= 64
        && preg_match('/^[A-Za-z0-9_\\.\\-@ ]+$/', $id) === 1;
}
