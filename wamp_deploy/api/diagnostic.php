<?php
/*
 * RECEPTION SALFA — Page de diagnostic MySQL (WAMP)
 * Ouvrir : http://localhost/reception-salfa/api/diagnostic.php
 * Version JSON (scripts) : diagnostic.php?format=json
 *
 * Vérifie : PHP, extensions, connexion MySQL, tables, volumes, doublons
 * (n° facture / n° dossier), limites PHP/MySQL, espace disque, écriture.
 * N'affiche JAMAIS le mot de passe MySQL. N'écrit RIEN durablement.
 */

require_once __DIR__ . '/lib.php';

/* ---------------------------------------------------------------------------
 *  Ce diagnostic expose des informations d'infrastructure (versions PHP et
 *  MySQL, nom de la base, nombre de lignes, espace disque) : il reste réservé
 *  au PC serveur. Depuis un autre poste du réseau, il exige une session
 *  valide (jeton de l'application connectée).
 * ------------------------------------------------------------------------- */
$__ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
$__local = ($__ip === '127.0.0.1' || $__ip === '::1' || strpos($__ip, '127.') === 0
    || strpos($__ip, '::ffff:127.') === 0);
if (!$__local) {
    try {
        salfa_session_exige(salfa_pdo());
    } catch (Exception $e) {
        http_response_code(403);
        exit('Diagnostic réservé au PC serveur (ou à une session connectée).');
    }
}
unset($__ip, $__local);

$verifs = array(); // chaque entrée : array('titre', 'statut', 'detail')
function diag_ajouter($titre, $statut, $detail = '') {
    global $verifs;
    $verifs[] = array('titre' => $titre, 'statut' => $statut, 'detail' => $detail);
}
function diag_octets($v) { // "128M" → octets
    $v = trim((string) $v);
    $n = (float) $v;
    $u = strtolower(substr($v, -1));
    if ($u === 'g') { $n *= 1073741824; } elseif ($u === 'm') { $n *= 1048576; } elseif ($u === 'k') { $n *= 1024; }
    return (int) $n;
}
function diag_lisible($octets) {
    if ($octets < 1024) { return $octets . ' o'; }
    if ($octets < 1048576) { return round($octets / 1024, 1) . ' Ko'; }
    if ($octets < 1073741824) { return round($octets / 1048576, 1) . ' Mo'; }
    return round($octets / 1073741824, 2) . ' Go';
}

/* ------------------------------------------------------------- PHP --- */
if (version_compare(PHP_VERSION, '8.0', '>=')) {
    diag_ajouter('Version PHP (' . PHP_VERSION . ')', 'ok');
} elseif (version_compare(PHP_VERSION, '7.4', '>=')) {
    diag_ajouter('Version PHP (' . PHP_VERSION . ')', 'avertissement', 'Fonctionne, mais PHP 8+ recommandé.');
} else {
    diag_ajouter('Version PHP (' . PHP_VERSION . ')', 'erreur', 'PHP 7.4 minimum requis.');
}
foreach (array('pdo_mysql' => 'obligatoire', 'json' => 'obligatoire', 'mbstring' => 'recommandée') as $ext => $niveau) {
    if (extension_loaded($ext)) {
        diag_ajouter('Extension PHP ' . $ext, 'ok');
    } elseif ($niveau === 'obligatoire') {
        diag_ajouter('Extension PHP ' . $ext, 'erreur', 'Activez-la dans WAMP (clic gauche → PHP → extensions).');
    } else {
        diag_ajouter('Extension PHP ' . $ext, 'avertissement', 'Recommandée pour les accents.');
    }
}
$post_max = diag_octets(ini_get('post_max_size'));
$memory = diag_octets(ini_get('memory_limit'));
diag_ajouter(
    'Limite POST (post_max_size = ' . ini_get('post_max_size') . ')',
    $post_max >= 67108864 ? 'ok' : 'avertissement',
    $post_max >= 67108864 ? '' : 'Sous 64 Mo, les grosses sauvegardes échoueront (php.ini → post_max_size = 128M).'
);
diag_ajouter(
    'Mémoire PHP (memory_limit = ' . ini_get('memory_limit') . ')',
    ($memory <= 0 || $memory >= 268435456) ? 'ok' : 'avertissement',
    ($memory <= 0 || $memory >= 268435456) ? '' : '256 Mo minimum conseillés (php.ini → memory_limit = 512M).'
);

/* ----------------------------------------------------------- MySQL --- */
$pdo = null;
try {
    $pdo = salfa_pdo();
    $version_mysql = (string) $pdo->query('SELECT VERSION()')->fetchColumn();
    diag_ajouter('Connexion MySQL (' . SALFA_DB_HOST . ' / base ' . SALFA_DB_NAME . ')', 'ok', 'Serveur : ' . $version_mysql);
    try {
        $paquet = (int) $pdo->query("SHOW VARIABLES LIKE 'max_allowed_packet'")->fetchColumn(1);
        diag_ajouter(
            'Paquet MySQL maximal (' . diag_lisible($paquet) . ')',
            $paquet >= 67108864 ? 'ok' : 'avertissement',
            $paquet >= 67108864 ? '' : 'Sous 64 Mo, les grosses sauvegardes échoueront (my.ini → max_allowed_packet = 128M).'
        );
    } catch (Exception $e) { diag_ajouter('Paquet MySQL maximal', 'avertissement', 'Variable illisible.'); }
} catch (Exception $e) {
    diag_ajouter('Connexion MySQL (' . SALFA_DB_HOST . ' / base ' . SALFA_DB_NAME . ')', 'erreur',
        'Vérifiez que WAMP est démarré (icône verte), que la base existe (schema.sql importé) et que config.local.php contient les bons identifiants.'
        . (SALFA_DEBUG ? ' Détail : ' . $e->getMessage() : ''));
}

if ($pdo instanceof PDO) {
    /* --------------------------------------------------- tables --- */
    $tables_attendues = salfa_tables();
    $tables_attendues['(paramètres)'] = 'parametres';
    $tables_attendues['(compteurs)'] = 'compteurs';
    $tables_attendues['(séquences)'] = 'sequences';
    $tables_attendues['(sessions)'] = 'sessions';
    $manquantes = array();
    $lignes_total = 0;
    foreach ($tables_attendues as $table) {
        try {
            $n = (int) $pdo->query('SELECT COUNT(*) FROM `' . $table . '`')->fetchColumn();
            $lignes_total += $n;
        } catch (Exception $e) {
            $manquantes[] = $table;
        }
    }
    if (count($manquantes) === 0) {
        diag_ajouter('Tables (' . count($tables_attendues) . ' attendues)', 'ok', number_format($lignes_total, 0, ',', ' ') . ' lignes au total.');
    } else {
        diag_ajouter('Tables (' . count($manquantes) . ' manquantes)', 'erreur',
            'Base existante : importez database/migrations/002_sequences.sql ; nouvelle base : database/schema.sql. Manquantes : ' . implode(', ', $manquantes));
    }

    /* ----------------------------------------- version + compteurs --- */
    try {
        $stmt = $pdo->query("SELECT `valeur` FROM `parametres` WHERE `cle` = 'schema_version' LIMIT 1");
        $row = $stmt->fetch();
        $v = ($row && isset($row['valeur'])) ? json_decode($row['valeur'], true) : null;
        if ((string) $v === (string) SALFA_SCHEMA_VERSION) {
            diag_ajouter('Version du schéma (v' . $v . ')', 'ok');
        } else {
            diag_ajouter('Version du schéma', 'avertissement', 'Base en v' . var_export($v, true) . ', API en v' . SALFA_SCHEMA_VERSION . ' : importez database/migrations/002_sequences.sql dans phpMyAdmin, puis rechargez.');
        }
    } catch (Exception $e) { diag_ajouter('Version du schéma', 'avertissement', 'Table `parametres` illisible.'); }

    try {
        $rows = $pdo->query('SELECT `cle`, `valeur` FROM `compteurs`')->fetchAll();
        $txt = array();
        foreach ($rows as $r) { $txt[] = $r['cle'] . ' = ' . $r['valeur']; }
        diag_ajouter('Compteurs', 'ok', implode(' · ', $txt));
    } catch (Exception $e) { diag_ajouter('Compteurs', 'avertissement', 'Table `compteurs` illisible.'); }

    /* ---------------------------------------------- taille de base --- */
    try {
        $stmt = $pdo->query(
            'SELECT SUM(data_length + index_length) AS taille FROM information_schema.TABLES'
            . " WHERE table_schema = '" . str_replace("'", "''", SALFA_DB_NAME) . "'"
        );
        $taille = (int) $stmt->fetchColumn();
        $seuil = 1073741824; // 1 Go : l'architecture sync complet devient critique
        diag_ajouter('Taille de la base (' . diag_lisible($taille) . ')',
            $taille < $seuil ? 'ok' : 'avertissement',
            $taille < $seuil ? '' : 'Au-delà d\'1 Go, prévoyez l\'API incrémentale (Phase 1) et l\'archivage.');
    } catch (Exception $e) { diag_ajouter('Taille de la base', 'avertissement', 'information_schema illisible.'); }

    /* ------------------------------------- révision d'état (schema v3) --- */
    try {
        $n_rev = (int) $pdo->query('SELECT COUNT(*) FROM information_schema.TABLES'
            . " WHERE table_schema = '" . str_replace("'", "''", SALFA_DB_NAME) . "' AND table_name = 'revision'")->fetchColumn();
        if ($n_rev === 1) {
            $rev = (int) $pdo->query('SELECT `rev` FROM `revision` WHERE `id` = 1')->fetchColumn();
            diag_ajouter('Révision d’état (poll léger)', 'ok', 'révision ' . number_format($rev, 0, ',', ' ')
                . ' — les postes ne relisent la base que quand elle a changé.');
        } else {
            diag_ajouter('Révision d’état (poll léger)', 'avertissement',
                'Table `revision` absente : importez database/migrations/003_performance.sql. Sans elle, chaque poste relit TOUT l’état toutes les 5 secondes.');
        }
    } catch (Exception $e) { diag_ajouter('Révision d’état', 'avertissement', 'Lecture impossible.'); }

    /* ------------------------------- moteur InnoDB : mémoire & journal --- */
    try {
        $bp = 0;
        $stmt = $pdo->query("SHOW VARIABLES LIKE 'innodb_buffer_pool_size'");
        $row = $stmt->fetch();
        if ($row) { $bp = (int) (isset($row['Value']) ? $row['Value'] : 0); }
        diag_ajouter('InnoDB buffer pool (' . diag_lisible($bp) . ')',
            $bp >= 134217728 ? 'ok' : 'avertissement',
            $bp >= 134217728 ? '' : '128 Mo conseillés minimum (my.ini → innodb_buffer_pool_size = 512M sur un PC dédié) : sous 16 Mo, chaque relecture relit le disque.');
    } catch (Exception $e) { diag_ajouter('InnoDB buffer pool', 'avertissement', 'Variable illisible.'); }

    try {
        $stmt = $pdo->query("SHOW VARIABLES LIKE 'log_bin'");
        $row = $stmt->fetch();
        $log_bin = ($row && isset($row['Value'])) ? strtoupper((string) $row['Value']) : 'OFF';
        if ($log_bin === 'ON') {
            $expire = 0;
            try {
                $s2 = $pdo->query("SHOW VARIABLES LIKE 'binlog_expire_logs_seconds'")->fetch();
                if ($s2) { $expire = (int) (isset($s2['Value']) ? $s2['Value'] : 0); }
            } catch (Exception $e) {
                try {
                    $s3 = $pdo->query("SHOW VARIABLES LIKE 'expire_logs_days'")->fetch();
                    if ($s3) { $expire = (int) (isset($s3['Value']) ? $s3['Value'] : 0) * 86400; }
                } catch (Exception $e2) { $expire = 0; }
            }
            diag_ajouter('Binaire log MySQL (log_bin)', $expire > 0 ? 'ok' : 'erreur',
                $expire > 0 ? 'Retention : ' . round($expire / 86400) . ' jour(s).'
                    : 'Journal binaire ACTIVÉ sans purge (réglage par défaut de WAMP) : il grossit tous les jours sur le même disque que la base et finit par la saturer. Dans my.ini [mysqld] : binlog_expire_logs_seconds = 604800 (7 j) — ou skip-log-bin si aucune réplication n’est prévue.');
        } else {
            diag_ajouter('Binaire log MySQL (log_bin)', 'ok', 'Désactivé : pas de grossissement du disque.');
        }
    } catch (Exception $e) { diag_ajouter('Binaire log MySQL', 'avertissement', 'Variable illisible.'); }

    /* ----------------------------------- sessions actives & anti-écrasement */
    try {
        $n = (int) $pdo->query('SELECT COUNT(*) FROM `sessions` WHERE `expire_le` > NOW()')->fetchColumn();
        diag_ajouter('Sessions de travail ouvertes', $n <= 24 ? 'ok' : 'avertissement',
            $n . ' jeton(s) valide(s) (12 h maximum chacun). '
            . ($n > 24 ? 'Plus que de postes réels ? Des déconnexions n’ont pas été révoquées : vérifier que le poste utilise bien action=logout.' : ''));
    } catch (Exception $e) { diag_ajouter('Sessions de travail', 'avertissement', 'Table `sessions` illisible.'); }

    /* ------------------------------------------- projection « mur mémoire » */
    // read_all renvoie TOUT l'état : le pic mémoire PHP ≈ 5 × le volume JSON.
    // On compare ce pic à memory_limit pour dire au praticien OU en est son
    // installation (le chiffre « mois restants » suppose ~100 passages/jour).
    try {
        $octets = (int) $pdo->query(
            'SELECT COALESCE(SUM(data_length), 0) FROM information_schema.TABLES'
            . " WHERE table_schema = '" . str_replace("'", "''", SALFA_DB_NAME) . "'"
        )->fetchColumn();
        $lignes = (int) $pdo->query(
            'SELECT COALESCE(SUM(table_rows), 0) FROM information_schema.TABLES'
            . " WHERE table_schema = '" . str_replace("'", "''", SALFA_DB_NAME) . "'"
        )->fetchColumn();
        $pic = $octets * 5;
        $plafond = $memory > 0 ? $memory : 0;
        $ratio = $plafond > 0 ? $pic / $plafond : 0;
        $passages = max(1, (int) round($octets / 12094));
        $jours_restants = $plafond > 0 ? max(0, (int) round((($plafond / 5) - $octets) / (100 * 12094))) : 0;
        $statut = $ratio < 0.4 ? 'ok' : ($ratio < 0.8 ? 'avertissement' : 'erreur');
        diag_ajouter('Charge de relecture complète (read_all)', $statut,
            number_format($lignes, 0, ',', ' ') . ' lignes · ~' . diag_lisible($octets) . ' transférés à CHAQUE relecture, pic mémoire PHP estimé '
            . diag_lisible($pic) . ' sur une limite de ' . ($plafond > 0 ? diag_lisible($plafond) : 'illimitée')
            . '. Soit ~' . number_format($passages, 0, ',', ' ') . ' passages enregistrés'
            . ($plafond > 0 ? ' ; à 100 passages/jour, la relecture complète devient impossible dans environ ' . ($jours_restants > 365 ? round($jours_restants / 365) . ' an(s)' : $jours_restants . ' jour(s)') . '.' : '.')
            . ' Gain immédiat : migration 003 (poll). Gain structurel : API incrémentale + archivage (voir docs/PERFORMANCE.md).');
    } catch (Exception $e) { diag_ajouter('Charge de relecture complète', 'avertissement', 'information_schema illisible.'); }

    /* ------------------------------------------------- doublons --- */
    $controles_doublons = array(
        'ventes (n° facture)'   => array('ventes', 'numero_ref'),
        'factures (n° facture)' => array('factures', 'numero_ref'),
        'patients (n° dossier)' => array('patients', 'dossier_ref'),
    );
    foreach ($controles_doublons as $titre => $cible) {
        try {
            $stmt = $pdo->query(
                'SELECT `' . $cible[1] . '`, COUNT(*) AS n FROM `' . $cible[0] . '`'
                . ' WHERE `' . $cible[1] . '` IS NOT NULL'
                . ' GROUP BY `' . $cible[1] . '` HAVING n > 1 LIMIT 5'
            );
            $dups = $stmt->fetchAll();
            if (count($dups) === 0) {
                diag_ajouter('Doublons — ' . $titre, 'ok', 'Aucun.');
            } else {
                $ex = array();
                foreach ($dups as $d) { $ex[] = $d[$cible[1]] . ' (×' . $d['n'] . ')'; }
                diag_ajouter('Doublons — ' . $titre, 'avertissement',
                    'À corriger manuellement (caisses simultanées ?) : ' . implode(', ', $ex));
            }
        } catch (Exception $e) {
            diag_ajouter('Doublons — ' . $titre, 'avertissement', 'Table illisible.');
        }
    }

    /* ------------------------------------------- test écriture --- */
    try {
        $pdo->beginTransaction();
        $t = $pdo->prepare("INSERT INTO `parametres` (`cle`, `valeur`) VALUES ('__diag_test__', '1') ON DUPLICATE KEY UPDATE `valeur` = VALUES(`valeur`)");
        $t->execute();
        $pdo->rollBack(); // rien n'est conservé : test sans écriture durable
        diag_ajouter('Droits d\'écriture (test annulé)', 'ok');
    } catch (Exception $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        diag_ajouter('Droits d\'écriture', 'erreur', 'L\'utilisateur MySQL ne peut pas écrire dans la base.');
    }
}

/* --------------------------------------------------- disque/logs --- */
$libre = @disk_free_space(__DIR__);
if ($libre === false) {
    diag_ajouter('Espace disque', 'avertissement', 'Illisible.');
} else {
    diag_ajouter('Espace disque libre (' . diag_lisible($libre) . ')',
        $libre > 1073741824 ? 'ok' : 'erreur',
        $libre > 1073741824 ? '' : 'Moins d\'1 Go libre : sauvegardez et libérez de l\'espace, vite.');
}
$dir_logs = __DIR__ . '/logs';
if (!is_dir($dir_logs)) { @mkdir($dir_logs, 0755, true); }
diag_ajouter('Journal api/logs/',
    (is_dir($dir_logs) && is_writable($dir_logs)) ? 'ok' : 'avertissement',
    (is_dir($dir_logs) && is_writable($dir_logs)) ? '' : 'Dossier non accessible en écriture.');
diag_ajouter('Fichier config.local.php',
    is_file(__DIR__ . '/config.local.php') ? 'ok' : 'avertissement',
    is_file(__DIR__ . '/config.local.php') ? 'Surcharge locale active.' : 'Absent : identifiants WAMP par défaut utilisés.');

/* ------------------------------------------------------------ rendu --- */
if (isset($_GET['format']) && $_GET['format'] === 'json') {
    salfa_repondre(array('success' => true, 'verifications' => $verifs));
}

$nb_ok = 0; $nb_avert = 0; $nb_err = 0;
foreach ($verifs as $v) {
    if ($v['statut'] === 'ok') { $nb_ok++; }
    elseif ($v['statut'] === 'avertissement') { $nb_avert++; }
    else { $nb_err++; }
}
?>
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diagnostic — RECEPTION SALFA (MySQL)</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; background: #f1f5f9; color: #1e293b; margin: 0; padding: 24px; }
  .carte { max-width: 860px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 24px 28px; box-shadow: 0 4px 18px rgba(0,0,0,.08); }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sous { color: #64748b; font-size: 13px; margin-bottom: 16px; }
  .resume { display: flex; gap: 10px; margin: 14px 0 20px; flex-wrap: wrap; }
  .pastille { border-radius: 20px; padding: 6px 14px; font-size: 13px; font-weight: bold; }
  .ok-fond { background: #dcfce7; color: #166534; }
  .avert-fond { background: #fef3c7; color: #92400e; }
  .err-fond { background: #fee2e2; color: #991b1b; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td, th { border-bottom: 1px solid #e2e8f0; padding: 9px 8px; text-align: left; vertical-align: top; }
  .statut { font-weight: bold; white-space: nowrap; }
  .ok { color: #16a34a; } .avertissement { color: #d97706; } .erreur { color: #dc2626; }
  .detail { color: #475569; font-size: 13px; }
  .pied { margin-top: 18px; font-size: 13px; color: #64748b; }
  a { color: #0284c7; }
</style>
</head>
<body>
<div class="carte">
  <h1>🩺 Diagnostic — RECEPTION SALFA (MySQL)</h1>
  <div class="sous"><?php echo htmlspecialchars(date('d/m/Y H:i:s')); ?> · <a href="../index.html">← Retour à l'application</a> · <a href="?format=json">Version JSON</a></div>
  <div class="resume">
    <span class="pastille ok-fond">✅ <?php echo $nb_ok; ?> OK</span>
    <span class="pastille avert-fond">⚠️ <?php echo $nb_avert; ?> avertissements</span>
    <span class="pastille err-fond">❌ <?php echo $nb_err; ?> erreurs</span>
  </div>
  <table>
    <tr><th>Vérification</th><th>Statut</th><th>Détail / conduite à tenir</th></tr>
    <?php foreach ($verifs as $v): ?>
    <tr>
      <td><?php echo htmlspecialchars($v['titre']); ?></td>
      <td class="statut <?php echo htmlspecialchars($v['statut']); ?>">
        <?php echo $v['statut'] === 'ok' ? '✅ OK' : ($v['statut'] === 'avertissement' ? '⚠️ À voir' : '❌ Erreur'); ?>
      </td>
      <td class="detail"><?php echo htmlspecialchars($v['detail']); ?></td>
    </tr>
    <?php endforeach; ?>
  </table>
  <div class="pied">Si tout est vert, ouvrez <a href="../index.html">l'application</a> et connectez-vous (comptes par défaut dans <code>database/seed.sql</code> — à changer aussitôt). En cas d'erreur MySQL : WAMP démarré (icône verte) ? <code>schema.sql</code> puis <code>seed.sql</code> importés ? <code>api/config.local.php</code> correct ?</div>
</div>
</body>
</html>
