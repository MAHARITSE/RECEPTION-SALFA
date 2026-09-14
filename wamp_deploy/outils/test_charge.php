<?php
/*
 * ============================================================================
 *  RECEPTION SALFA — Banc d'essai de charge (à lancer SUR le PC serveur)
 * ============================================================================
 *  Usage (invite de commandes, dossier wamp_deploy\outils) :
 *
 *      php test_charge.php
 *      php test_charge.php --passages=140 --projection=512
 *      php test_charge.php --max-lignes=50000
 *
 *  Ce script NE MODIFIE AUCUNE DONNÉE. Il mesure sur votre installation réelle :
 *    1) l'environnement (limites PHP/MySQL/Apache réellement applicables) ;
 *    2) le coût du sondage léger (`action=poll`) ;
 *    3) le coût d'une relecture complète (`read_all`) : octets, temps, mémoire ;
 *    4) la date à laquelle chaque limite est franchie à votre rythme de traffic.
 *
 *  À lancer HORS HEURES D'OUVERTURE : la mesure n°3 lit toute la base.
 *  `php` doit être celui de WAMP (C:\wamp64\bin\php\phpX.Y.Z\php.exe), sinon :
 *     "C:\wamp64\bin\php\php8.3.1\php.exe" test_charge.php
 * ============================================================================
 */

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("En ligne de commandes uniquement.\n"); }
require_once __DIR__ . '/../api/lib.php';

$OPT = array('passages' => 100, 'projection' => 0, 'max-lignes' => 200000, 'jours' => 300);
foreach (array_slice($argv, 1) as $a) {
    if (preg_match('/^--([a-z\-]+)(?:=(.*))?$/', $a, $m)) { $OPT[strtolower($m[1])] = $m[2] === null ? true : $m[2]; }
}
$passagesJour = max(1, (int) $OPT['passages']);
$joursAn      = max(100, (int) $OPT['jours']);
$maxLignes    = max(1000, (int) $OPT['max-lignes']);

function octets($v) {
    $v = trim((string) $v); if ($v === '') return 0;
    $n = (float) $v; $u = strtolower(substr($v, -1));
    if ($u === 'g') $n *= 1073741824; elseif ($u === 'm') $n *= 1048576; elseif ($u === 'k') $n *= 1024;
    return (int) $n;
}
function lisible($b) {
    if ($b >= 1073741824) return round($b / 1073741824, 2) . ' Go';
    if ($b >= 1048576) return round($b / 1048576, 1) . ' Mo';
    if ($b >= 1024) return round($b / 1024, 1) . ' Ko';
    return $b . ' o';
}
function titre($t) { echo "\n== " . strtoupper($t) . " ==\n" . str_repeat('-', strlen($t)) . "\n"; }
function ligne($k, $v, $statut = '') {
    printf("  %-46s %s%s\n", $k, $v, $statut === '' ? '' : "   [" . $statut . "]");
}
function verdict($ratio) { return $ratio < 0.4 ? 'OK' : ($ratio < 0.8 ? 'ATTENTION' : 'CRITIQUE'); }

echo "RECEPTION SALFA — banc d'essai de charge (lecture seule)\n";
echo 'Base : ' . SALFA_DB_NAME . ' @ ' . SALFA_DB_HOST . ':' . SALFA_DB_PORT . ' · ' . date('d/m/Y H:i:s') . "\n";

/* ------------------------------------------------------------ 1. environnement */
titre('1) Environnement');
$memLim = octets(ini_get('memory_limit'));
$postLim = octets(ini_get('post_max_size'));
ligne('PHP ' . PHP_VERSION . ' · memory_limit', ini_get('memory_limit'), $memLim >= 536870912 ? 'OK' : 'À augmenter (voir config/wamp-salfa-php.ini.txt)');
ligne('PHP post_max_size', ini_get('post_max_size'), $postLim >= 67108864 ? 'OK' : 'À augmenter (128M)');
ligne('PHP max_execution_time', ini_get('max_execution_time') . ' s (peu fiable sous Windows : le vrai plafond est le Timeout d Apache)', '');

try {
    $pdo = salfa_pdo();
} catch (Exception $e) {
    echo "\n[ERREUR] Connexion MySQL impossible : " . $e->getMessage() . "\n";
    echo "         Vérifiez WAMP (icône verte) et api/config.local.php.\n";
    exit(1);
}
foreach (array('max_allowed_packet', 'innodb_buffer_pool_size', 'log_bin', 'innodb_flush_log_at_trx_commit', 'wait_timeout') as $v) {
    $row = $pdo->query("SHOW VARIABLES LIKE '$v'")->fetch();
    $val = $row ? (string) $row['Value'] : '?';
    $etat = '';
    if ($v === 'max_allowed_packet') $etat = octets($val) >= 67108864 ? 'OK' : 'TROP BAS (défaut WAMP = 1M) → my.ini';
    if ($v === 'innodb_buffer_pool_size') $etat = octets($val) >= 134217728 ? 'OK' : 'TROP BAS → my.ini';
    if ($v === 'log_bin' && strcasecmp($val, 'ON') === 0) $etat = 'À COUPER (skip-log-bin) : le journal remplit le disque';
    if ($v === 'innodb_flush_log_at_trx_commit' && $val !== '1') $etat = '1 recommandé (perte de 5 min après une coupure sinon)';
    ligne('MySQL ' . $v, lisible(octets($val)) === '0 o' ? $val : (lisible(octets($val)) . ' (' . $val . ')'), $etat);
}

/* ------------------------------------------------------------------ 2. volume */
titre('2) Volume de la base');
$totLignes = 0; $totOctets = 0; $parTable = array();
$stmt = $pdo->query("SELECT table_name t, table_rows r, data_length d, index_length i
                     FROM information_schema.tables WHERE table_schema = '" . str_replace("'", "''", SALFA_DB_NAME) . "'
                     ORDER BY (data_length + index_length) DESC");
while ($r = $stmt->fetch()) {
    $parTable[] = $r;
    $totLignes += (int) $r['r'];
    $totOctets += (int) $r['d'];
}
foreach (array_slice($parTable, 0, 8) as $r) {
    printf("  %-30s %10s lignes   %10s données  %10s index\n", $r['t'], number_format((int) $r['r'], 0, ',', ' '), lisible((int) $r['d']), lisible((int) $r['i']));
}
ligne('Total (15 premières tables comprises)', number_format($totLignes, 0, ',', ' ') . ' lignes · ' . lisible($totOctets) . ' de données');

// Volume JSON réellement stocké (ce que read_all doit transférer) : somme des
// longueurs de la colonne `donnees`, plafonnée pour ne pas saturer le serveur.
$scan = 0; $octetsJson = 0; $lignesScan = 0;
foreach (salfa_tables() as $table) {
    if ($scan > $maxLignes) break;
    try {
        $q = $pdo->query('SELECT COALESCE(SUM(LENGTH(`donnees`)),0) o, COUNT(*) n FROM `' . $table . '`');
        $r = $q->fetch();
        $octetsJson += (int) $r['o'];
        $lignesScan += (int) $r['n'];
        $scan += (int) $r['n'];
    } catch (Exception $e) { /* table absente */ }
}
ligne('JSON réellement stocké (payload read_all)', lisible($octetsJson) . ' pour ' . number_format($lignesScan, 0, ',', ' ') . ' lignes');
$parLigne = $lignesScan > 0 ? (int) ($octetsJson / $lignesScan) : 0;
ligne('Taille moyenne d’une ligne', $parLigne . ' o');

/* ------------------------------------------------------------------ 3. poll */
titre('3) Sondage léger (action=poll) — 200 lectures');
$revPresente = true;
try { $pdo->query('SELECT 1 FROM `revision` LIMIT 1'); } catch (Exception $e) { $revPresente = false; }
if (!$revPresente) {
    ligne('Table `revision`', 'ABSENTE', 'importez database/migrations/003_performance.sql — sans elle, chaque poste relit tout toutes les 5 s');
} else {
    $t0 = microtime(true);
    for ($i = 0; $i < 200; $i++) { $pdo->query('SELECT `rev` FROM `revision` WHERE `id` = 1')->fetch(); }
    $ms = (microtime(true) - $t0) * 1000 / 200;
    ligne('Durée moyenne d un poll', round($ms, 2) . ' ms', $ms < 30 ? 'OK' : ($ms < 150 ? 'ATTENTION' : 'CRITIQUE (disque ?)'));
    $rev = (int) $pdo->query('SELECT `rev` FROM `revision` WHERE `id` = 1')->fetchColumn();
    ligne('Révision courante', (string) $rev);
}

/* -------------------------------------------------------------- 4. read_all */
titre('4) Relecture complète (action=read_all)');
$pic = memory_get_usage(true);
$t0 = microtime(true);
$buffer = array();
$octetsLus = 0; $objets = 0; $erres = 0;
foreach (salfa_tables() as $table) {
    $q = $pdo->query('SELECT `donnees` FROM `' . $table . '`');
    while (($j = $q->fetchColumn()) !== false) {
        $octetsLus += strlen((string) $j);
        $o = json_decode((string) $j, true);
        if (is_array($o)) { $objets++; $buffer[] = $o; } else { $erres++; }
        if (count($buffer) > $maxLignes) { $buffer = array(); }
    }
    $q->closeCursor();
}
$sec = microtime(true) - $t0;
$pic = memory_get_peak_usage(true) - $pic;
$buffer = null;
ligne('Objets relus / décodés', number_format($objets, 0, ',', ' ') . ($erres ? ' (' . $erres . ' illisibles)' : ''));
ligne('Octets transférés', lisible($octetsLus));
ligne('Durée (PDO + json_decode, sans réseau)', round($sec, 2) . ' s → ' . lisible($octetsLus / max(0.001, $sec)) . '/s');
ligne('Pic mémoire PHP consommé', lisible($pic) . ' sur une limite de ' . ($memLim > 0 ? lisible($memLim) : 'illimitée'),
    $memLim > 0 ? verdict($pic / $memLim) : '');
echo "  → Le même chiffre, multiplié par ~1,4 (ré-encodage JSON de la réponse) et\n";
echo "    additionné du temps réseau, est ce que PAIENT tous les postes à chaque\n";
echo "    relecture. C'est LE goulot de l'architecture « état complet ».\n";

/* ------------------------------------------------------------- 5. projection */
titre('5) Projection à ' . $passagesJour . ' passages/jour, ' . $joursAn . ' jours/an');
// Volume par jour d'exploitation : mesuré sur la base si elle est ancienne,
// sinon estimé à ~12 Ko de JSON par passage (taille constatée du jeu de données).
$premieres = null;
try {
    $premieres = (int) $pdo->query('SELECT COALESCE(UNIX_TIMESTAMP(MIN(`mis_a_jour`)),0) FROM `patients`')->fetchColumn();
} catch (Exception $e) { $premieres = 0; }
$ageJours = ($premieres > 0) ? max(1, (int) floor((time() - $premieres) / 86400)) : 0;
$parJour = $ageJours > 0 ? (int) ($octetsJson / $ageJours) : (int) ($passagesJour * 12094);
printf("  %-10s %-14s %-16s %s\n", 'horizon', 'volume base', 'pic read_all', 'statut / franchissement');
for ($a = 0.25; $a <= 10.01; $a += $a < 1 ? 0.25 : ($a < 3 ? 0.5 : 1)) {
    $vol = $octetsJson + $parJour * (int) round($a * $joursAn);
    $p = $vol * 5;
    $etat = $memLim > 0 ? verdict($p / $memLim) : 'mémoire illimitée';
    printf("  %-10s %-14s %-16s %s\n", ($a < 1 ? round($a * 12) . ' mois' : rtrim(rtrim(number_format($a, 2, '.', ''), '0'), '.') . ' an(s)'),
        lisible($vol), lisible($p), $etat);
}
$plafondVol = $memLim > 0 ? (int) ($memLim / 5) : 0;
$restants = ($plafondVol > 0 && $parJour > 0) ? max(0, (int) ceil(($plafondVol - $octetsJson) / $parJour)) : 0;
ligne('Volume maximal supporté par memory_limit', lisible($plafondVol) . ' de JSON');
ligne('Jours restants avant relecture impossible', $parJour > 0 ? number_format($restants, 0, ',', ' ') . ' jour(s) (≈ ' . round($restants / ($joursAn / 12), 1) . ' mois)' : 'inconnu (base trop récente)',
    $restants > 365 ? 'OK' : ($restants > 90 ? 'ATTENTION' : 'CRITIQUE'));
echo "\n  Lecture : ces chiffres SUPPOSENT l'architecture actuelle (relecture et\n";
echo "  réécriture complètes). La correction structurelle (API incrémentale,\n";
echo "  lecture fenêtrée, archivage) annule la contrainte : cf. doc/audit §7.\n";

/* ------------------------------------------------------------ 6. synthese */
titre('6) Conduite à tenir');
$conseils = array();
if ($memLim < 536870912) $conseils[] = 'php.ini : memory_limit = 1024M (sinon la relecture complète meurt vite).';
if ($postLim < 67108864) $conseils[] = 'php.ini : post_max_size = 256M (sinon les sauvegardes sont refusées silencieusement).';
$row = $pdo->query("SHOW VARIABLES LIKE 'max_allowed_packet'")->fetch();
if ($row && octets($row['Value']) < 67108864) $conseils[] = 'my.ini : max_allowed_packet = 64M ([mysqld] ET [mysqldump]).';
$row = $pdo->query("SHOW VARIABLES LIKE 'innodb_buffer_pool_size'")->fetch();
if ($row && octets($row['Value']) < 134217728) $conseils[] = 'my.ini : innodb_buffer_pool_size = 1G.';
$row = $pdo->query("SHOW VARIABLES LIKE 'log_bin'")->fetch();
if ($row && strcasecmp($row['Value'], 'ON') === 0) $conseils[] = 'my.ini : skip-log-bin (sinon le journal remplit le disque du serveur).';
if (!$revPresente) $conseils[] = 'Importer database/migrations/003_performance.sql (poll + index de fraîcheur) : supprime la relecture inutile toutes les 5 s.';
$conseils[] = 'Archiver les années closes (PERFORMANCE.md §Archivage) : la base ne doit pas grossir sans limite.';
$conseils[] = 'Contrôler la sauvegarde : mysqldump testé par restauration sur un PC d’essai, hors du serveur.';
foreach ($conseils as $i => $c) echo '  ' . ($i + 1) . '. ' . $c . "\n";
echo "\nTerminé. Aucune donnée n'a été modifiée.\n";
exit(0);
