<?php
/*
 * RECEPTION SALFA — API d'état MySQL (WAMP)
 * ============================================================================
 *   GET  api/index.php?action=info      → heure serveur + version de schéma
 *   GET  api/index.php?action=poll      → révisions : la base a-t-elle bougé ? (léger)
 *   GET  api/index.php?action=read_all  → état complet { success, datasets }
 *   POST api/index.php?action=sync_all  → sauvegarde { datasets, deletions?, if_rev?, token? }
 *   POST api/index.php?action=numero    → numéros de facture { items, seeds? }
 *                                          → { success, seqs: [ordres…] }
 *   GET  api/index.php?action=utilisateurs → comptes publics (sans mots de passe)
 *   POST api/index.php?action=login       → { id, password } → { user, token }
 *   POST api/index.php?action=logout      → révoque le jeton de session
 *   POST api/index.php?action=password    → redéfinition admin { id, password }
 *
 * RÈGLES DE SÉCURITÉ DES DONNÉES :
 *  - sync_all est TRANSACTIONNEL : tout est enregistré, ou rien (jamais
 *    une sauvegarde à moitié écrite).
 *  - Anti-écrasement entre postes : le client peut envoyer `if_rev` (la
 *    révision lue). Si la base a bougé entre-temps → HTTP 409 : le client
 *    relit, fusionne et rejoue. Personne n'écrase le travail d'un collègue.
 *  - `poll` (GET) répond la révision courante en une lecture de clé primaire :
 *    les postes ne relisent TOUT l'état que si la base a réellement changé
 *    (sinon, quelques octets sur le réseau au lieu de dizaines de Mo).
 *  - ACL SERVEUR : `utilisateurs` (comptes, rôles) n'est modifiable que par un
 *    administrateur (sauf table vide = première installation). Un poste
 *    « réception » ne peut donc pas se promouvoir admin puis changer les mots
 *    de passe des autres.
 *  - `journal_audit` est APPEND-ONLY (INSERT IGNORE) : une ligne d'audit
 *    enregistrée ne peut plus être réécrite, par personne ; seule
 *    l'administration peut purger (archivage recommandé à la place).
 *  - Connexions : 5 échecs par compte+IP → blocage 15 min (anti-force brute).
 *    `logout` révoque le jeton ; redéfinir un mot de passe révoque toutes les
 *    sessions de ce compte ; un jeton dont le compte a disparu est refusé.
 *  - numero attribue les ordres de facture SOUS VERROU (SELECT … FOR UPDATE,
 *    table `sequences`) : deux caisses n'obtiennent jamais le même numéro,
 *    même en facturant à la même seconde. Une période inédite est amorcée
 *    depuis l'historique (jamais de réutilisation), ensuite incrément O(1).
 *  - read_all, sync_all et numero exigent un JETON DE SESSION valide
 *    (table `sessions`, 12 h, délivré par login). Sans session : 401.
 *  - Les mots de passe ne quittent JAMAIS le serveur en lecture (même les
 *    admins ne reçoivent que id/nom/rôles) ; sync_all préserve toujours le
 *    mot de passe déjà en base. Stockage : bcrypt (migration paresseuse
 *    depuis les empreintes `sha256:` du client et l'historique en clair).
 *  - Seules les suppressions EXPLICITES (champ `deletions`) effacent des
 *    lignes. Un dataset absent du payload n'est jamais vidé : un poste en
 *    retard ne peut pas effacer le travail des autres.
 *  - Les compteurs (`factureCounter`…) ne diminuent JAMAIS (GREATEST) :
 *    un envoi périmé ne fait pas réutiliser un numéro de facture.
 *  - Requêtes préparées partout ; noms de tables issus d'une liste fermée.
 * ============================================================================
 */

require_once __DIR__ . '/lib.php';

salfa_verifier_cle();

$action = isset($_GET['action']) ? (string) $_GET['action'] : '';
$methode = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

/* ---------------------------------------------------------------- info --- */
if ($action === 'info' && $methode === 'GET') {
    $version_schema = null;
    $erreur_db = null;
    try {
        $pdo = salfa_pdo();
        $stmt = $pdo->query("SELECT `valeur` FROM `parametres` WHERE `cle` = 'schema_version' LIMIT 1");
        $row = $stmt->fetch();
        if ($row && isset($row['valeur'])) {
            $version_schema = json_decode($row['valeur'], true);
        }
    } catch (Exception $e) {
        $erreur_db = SALFA_DEBUG ? $e->getMessage() : 'MySQL injoignable.';
    }
    salfa_repondre(array(
        'success'        => true,
        'heure_serveur'  => date('c'),
        'schema_version' => $version_schema,
        'schema_attendu' => SALFA_SCHEMA_VERSION,
        'php'            => PHP_VERSION,
        'erreur_db'      => $erreur_db,
    ));
}

/* --------------------------------------------------------------- poll --- */
if ($action === 'poll' && $methode === 'GET') {
    // Rafraîchissement LÉGER : « la base a-t-elle changé depuis ma lecture ? ».
    // Une seule ligne lue (clé primaire) au lieu de tout l'état : c'est ce qui
    // évite de relire des centaines de mégaoctets toutes les 5 secondes quand
    // 3 à 6 postes tournent en même temps.
    // Réponse : { success, rev } — `rev` = null si la migration 003 n'est pas
    // appliquée (le client retombe alors sur la relecture complète).
    try {
        $pdo = salfa_pdo();
        salfa_session_exige($pdo);
        // `rev` = null ⇒ migration 003 non appliquée : le client retombe sur la
        // relecture complète (comportement précédent), sans coût caché ici.
        salfa_repondre(array('success' => true, 'rev' => salfa_revision_lire($pdo)));
    } catch (Exception $e) {
        salfa_erreur('Sondage MySQL impossible.', 500, $e->getMessage());
    }
}

/* ------------------------------------------------------------ read_all --- */
if ($action === 'read_all' && $methode === 'GET') {
    try {
        $pdo = salfa_pdo();
        salfa_session_exige($pdo);
        $datasets = array();
        // Instantané cohérent : sans transaction, un poste peut lire l'état
        // AVANT la sauvegarde d'un collègue pour les premiers datasets et
        // APRÈS pour les suivants (état « déchiré »). De plus, la Révision
        // renvoyée correspond exactement à ce qui a été lu.
        $pdo->beginTransaction();

        foreach (salfa_tables() as $dataset => $table) {
            $lignes = array();
            $stmt = $pdo->query('SELECT `donnees` FROM `' . $table . '`');
            while (($json = $stmt->fetchColumn()) !== false) {
                $obj = json_decode($json, true);
                // Les lignes corrompues sont signalées et ignorées (jamais de crash).
                if (is_array($obj)) {
                    // Les mots de passe ne quittent JAMAIS le serveur en lecture.
                    if ($dataset === 'users') unset($obj['password']);
                    $lignes[] = $obj;
                } else {
                    salfa_log('AVERTISSEMENT — ligne JSON illisible ignorée dans `' . $table . '`.');
                }
            }
            $stmt->closeCursor();
            unset($stmt);
            $datasets[$dataset] = $lignes;
        }

        // Paramètres (objets uniques).
        $params = array();
        $stmt = $pdo->query('SELECT `cle`, `valeur` FROM `parametres`');
        foreach ($stmt->fetchAll() as $row) {
            $params[$row['cle']] = json_decode($row['valeur'], true);
        }
        $stmt->closeCursor();
        foreach (salfa_param_keys() as $cle) {
            if ($cle === 'ticketSettings') {
                $datasets[$cle] = (isset($params[$cle]) && is_array($params[$cle])) ? $params[$cle] : null;
            } else {
                $datasets[$cle] = (isset($params[$cle]) && is_array($params[$cle])) ? $params[$cle] : array();
            }
        }

        // Compteurs.
        $compteurs = array();
        $stmt = $pdo->query('SELECT `cle`, `valeur` FROM `compteurs`');
        foreach ($stmt->fetchAll() as $row) {
            $compteurs[$row['cle']] = (int) $row['valeur'];
        }
        $stmt->closeCursor();
        foreach (salfa_counter_keys() as $cle) {
            $datasets[$cle] = isset($compteurs[$cle]) ? (int) $compteurs[$cle] : 0;
        }

        $rev_lue = salfa_revision_lire($pdo);
        $pdo->commit();
        salfa_repondre(array('success' => true, 'datasets' => $datasets, 'rev' => $rev_lue));
    } catch (Exception $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        salfa_erreur('Lecture MySQL impossible.', 500, $e->getMessage());
    }
}

/* ------------------------------------------------------------ sync_all --- */
if ($action === 'sync_all' && $methode === 'POST') {
    // Garde-fou mémoire : refuse les corps démesurés avant de les lire.
    // La limite effective tient compte de memory_limit / post_max_size du
    // serveur : au-delà, PHP meurt en erreur opaque (500) au lieu d'un 413.
    $taille_max = salfa_limite_corps();
    $annonce = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($annonce > $taille_max) {
        salfa_erreur(
            'Sauvegarde trop volumineuse (' . round($annonce / 1048576, 1) . ' Mo, limite serveur '
            . round($taille_max / 1048576, 1) . ' Mo). Cause habituelle : memory_limit de WAMP trop'
            . ' bas (passer à 1024M dans le php.ini, cf. config/wamp-salfa-php.ini.txt). Réessayez en'
            . ' fermant les onglets inutiles, sinon archivez les années closes.',
            413
        );
    }

    $brut = file_get_contents('php://input');
    if ($brut === false || $brut === '') {
        salfa_erreur('Corps de requête vide.', 400);
    }
    $corps = json_decode($brut, true);
    unset($brut);
    if (!is_array($corps)) {
        salfa_erreur('Corps JSON invalide.', 400);
    }
    if (!isset($corps['datasets']) || !is_array($corps['datasets'])) {
        salfa_erreur('Champ `datasets` manquant ou invalide.', 400);
    }
    $datasets = $corps['datasets'];
    $suppressions = (isset($corps['deletions']) && is_array($corps['deletions'])) ? $corps['deletions'] : array();
    // Contrôle optimiste d'état (anti-écrasement entre postes) : si le poste
    // a lu la base à la révision N et que la base est à N+1, un autre poste a
    // écrit entre-temps → 409, le client relit, fusionne et rejoue.
    $rev_attendue = isset($corps['if_rev']) ? (int) $corps['if_rev'] : null;
    // sendBeacon ne peut pas poser d'en-tête : le jeton voyage dans le corps.
    $jeton_corps = isset($corps['token']) ? array('token' => $corps['token']) : null;
    unset($corps);

    $tables = salfa_tables();

    // --- Validation COMPLÈTE avant toute écriture (échec rapide, base intacte).
    foreach ($datasets as $dataset => $lignes) {
        if (!isset($tables[$dataset])) {
            if ($dataset === 'ticketSettings' || in_array($dataset, salfa_param_keys(), true)
                || in_array($dataset, salfa_counter_keys(), true)) {
                continue; // traité plus bas
            }
            salfa_log('AVERTISSEMENT — dataset inconnu ignoré : ' . $dataset);
            continue;
        }
        if (!is_array($lignes)) {
            salfa_erreur('Dataset `' . $dataset . '` invalide (liste attendue).', 400);
        }
        foreach ($lignes as $pos => $ligne) {
            if (!is_array($ligne) || !salfa_id_valide(isset($ligne['id']) ? $ligne['id'] : null)) {
                salfa_erreur('Enregistrement n°' . $pos . ' invalide dans `' . $dataset . '` (id manquant).', 400);
            }
        }
    }
    foreach ($suppressions as $dataset => $ids) {
        if (!isset($tables[$dataset])) {
            salfa_log('AVERTISSEMENT — suppressions ignorées (dataset inconnu) : ' . $dataset);
            continue;
        }
        if (!is_array($ids)) {
            salfa_erreur('Suppressions invalides pour `' . $dataset . '`.', 400);
        }
        foreach ($ids as $id) {
            if (!salfa_id_valide($id)) {
                salfa_erreur('Identifiant de suppression invalide dans `' . $dataset . '`.', 400);
            }
        }
    }

    // --- Écriture transactionnelle.
    $modifications = 0;
    try {
        $pdo = salfa_pdo();
        $session = salfa_session_exige($pdo, $jeton_corps);
        $est_admin = salfa_session_est_admin($pdo, $session);

        // Compression des comptes : seule l'administration écrit dans les
        // comptes et leurs rôles (sinon un poste s'auto-promeut « admin »,
        // puis redéfinit les mots de passe des autres via action=password).
        if (array_key_exists('users', $datasets)) {
            $datasets['users'] = salfa_filtrer_utilisateurs($pdo, $datasets['users'], $session, $est_admin);
        }
        if (!$est_admin && isset($suppressions['users'])) {
            salfa_log('REFUS — suppressions du dataset `users` par un compte non administrateur ('
                . (isset($session['id']) ? $session['id'] : '?') . ').');
            unset($suppressions['users']);
        }
        // Journal d'audit : purge réservée à l'administration.
        if (!$est_admin && isset($suppressions['auditLogs'])) {
            salfa_log('REFUS — purge du journal d’audit par un compte non administrateur.');
            unset($suppressions['auditLogs']);
        }

        $pdo->beginTransaction();

        // Contrôle optimiste : le poste a-t-il lu la base la plus récente ?
        // Le verrou (`FOR UPDATE` sur la ligne de révision) garantit qu'aucune
        // autre sauvegarde ne se glisse entre la comparaison et l'écriture.
        if ($rev_attendue !== null) {
            $rev_courante = salfa_revision_verrou($pdo);
            if ($rev_courante !== null && $rev_courante !== $rev_attendue) {
                $pdo->rollBack();
                salfa_repondre(array(
                    'success'  => false,
                    'error'    => 'conflict',
                    'conflict' => true,
                    'rev'      => $rev_courante,
                ), 409);
            }
        }

        foreach ($tables as $dataset => $table) {
            // Dataset absent du payload → on n'y touche PAS (jamais de vidage
            // implicite) : c'est ce qui permet un envoi DIFFÉRENTIEL (delta).
            if (!array_key_exists($dataset, $datasets) || !is_array($datasets[$dataset])) {
                continue;
            }
            // Journal d'audit : APPEND-ONLY. Une ligne déjà enregistrée n'est
            // jamais réécrite (INSERT IGNORE), nulle part, par personne : la
            // preuve d'antériorité ne peut pas être fabriquée après coup.
            $append_seul = ($table === 'journal_audit');
            $maj = $pdo->prepare(
                'INSERT' . ($append_seul ? ' IGNORE' : '') . ' INTO `' . $table . '` (`id`, `donnees`, `numero_ref`, `dossier_ref`)'
                . ' VALUES (:id, :donnees, :numero, :dossier)'
                . ($append_seul ? '' : ' ON DUPLICATE KEY UPDATE `donnees` = VALUES(`donnees`),'
                    . ' `numero_ref` = VALUES(`numero_ref`), `dossier_ref` = VALUES(`dossier_ref`)')
            );
            foreach ($datasets[$dataset] as $ligne) {
                // Comptes : le mot de passe en base est préservé (jamais écrasé
                // par une lecture expurgée) ; seul un compte inédit reçoit un initial.
                if ($dataset === 'users') $ligne = salfa_normaliser_mot_de_passe($pdo, $ligne);
                $json = json_encode($ligne, JSON_UNESCAPED_UNICODE);
                if ($json === false) {
                    throw new Exception('Encodage JSON impossible dans `' . $dataset . '`.');
                }
                // Références extraites pour les requêtes et la détection de doublons.
                $numero = (isset($ligne['numeroFacture']) && is_string($ligne['numeroFacture'])
                    && $ligne['numeroFacture'] !== '') ? substr($ligne['numeroFacture'], 0, 64) : null;
                $dossier = (isset($ligne['dossier']) && is_string($ligne['dossier'])
                    && $ligne['dossier'] !== '') ? substr($ligne['dossier'], 0, 64) : null;
                $maj->execute(array(
                    ':id'      => $ligne['id'],
                    ':donnees' => $json,
                    ':numero'  => $numero,
                    ':dossier' => $dossier,
                ));
                // rowCount : 0 quand la ligne est identique (rien d'écrit),
                // 1 si insérée, 2 si modifiée → sert à la révision d'état.
                $modifications += $maj->rowCount();
            }
        }

        // Suppressions explicites, pour TOUS les datasets connus — y compris
        // ceux qui ne sont pas poussés dans ce payload (envoi différentiel).
        foreach ($suppressions as $dataset => $ids) {
            if (!isset($tables[$dataset]) || !is_array($ids) || count($ids) === 0) {
                continue;
            }
            $table = $tables[$dataset];
            foreach (array_chunk(array_values($ids), 500) as $lot) {
                $marqueurs = implode(',', array_fill(0, count($lot), '?'));
                $del = $pdo->prepare('DELETE FROM `' . $table . '` WHERE `id` IN (' . $marqueurs . ')');
                $del->execute($lot);
                $modifications += $del->rowCount();
            }
        }

        // Paramètres : ticketSettings (objet) + listes JSON.
        $maj_param = $pdo->prepare(
            'INSERT INTO `parametres` (`cle`, `valeur`) VALUES (:cle, :valeur)'
            . ' ON DUPLICATE KEY UPDATE `valeur` = VALUES(`valeur`)'
        );
        foreach (salfa_param_keys() as $cle) {
            if (!array_key_exists($cle, $datasets)) {
                continue;
            }
            $valeur = $datasets[$cle];
            if ($cle === 'ticketSettings') {
                if (!is_array($valeur)) {
                    continue; // réglages absents : on garde ceux en base
                }
            } elseif (!is_array($valeur)) {
                throw new Exception('Paramètre `' . $cle . '` invalide (liste attendue).');
            }
            $json = json_encode($valeur, JSON_UNESCAPED_UNICODE);
            if ($json === false) {
                throw new Exception('Encodage JSON impossible pour `' . $cle . '`.');
            }
            $maj_param->execute(array(':cle' => $cle, ':valeur' => $json));
            $modifications += $maj_param->rowCount();
        }

        // Compteurs : la valeur ne diminue JAMAIS (envoi périmé sans effet).
        $maj_cpt = $pdo->prepare(
            'INSERT INTO `compteurs` (`cle`, `valeur`) VALUES (:cle, :valeur)'
            . ' ON DUPLICATE KEY UPDATE `valeur` = GREATEST(`valeur`, VALUES(`valeur`))'
        );
        foreach (salfa_counter_keys() as $cle) {
            if (!array_key_exists($cle, $datasets)) {
                continue;
            }
            $maj_cpt->execute(array(':cle' => $cle, ':valeur' => (int) $datasets[$cle]));
            $modifications += $maj_cpt->rowCount();
        }

        // Révision d'état : le rafraîchissement léger (`action=poll`) s'y fie
        // pour décider s'il faut relire toute la base. Une écriture qui n'a
        // rien changé (ré-envoi identique) ne réveille donc PAS les autres postes.
        if ($modifications > 0) {
            salfa_revision_marquer($pdo, 1);
        }

        $pdo->commit();
        salfa_repondre(array('success' => true, 'rev' => salfa_revision_lire($pdo)));
    } catch (Exception $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        salfa_erreur('Sauvegarde MySQL impossible (aucune donnée modifiée).', 500, $e->getMessage());
    }
}

/* -------------------------------------------------------------- numero --- */
if ($action === 'numero' && $methode === 'POST') {
    // Attribution ATOMIQUE d'ordres de facture (multi-caisses).
    // Corps : { items: [{ kind: 'standard'|'societe', period: 'AAMMJJ'|'AAMM' }…],
    //           seeds?: [numéros déjà émis…] }.
    // Réponse : { success: true, seqs: [ordre…] } (même ordre que `items`).
    $taille_max = salfa_limite_corps();
    $annonce = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($annonce > $taille_max) {
        salfa_erreur('Requête trop volumineuse (' . round($annonce / 1048576, 1) . ' Mo, limite serveur '
            . round($taille_max / 1048576, 1) . ' Mo).', 413);
    }
    $brut = file_get_contents('php://input');
    if ($brut === false || $brut === '') {
        salfa_erreur('Corps de requête vide.', 400);
    }
    $corps = json_decode($brut, true);
    unset($brut);
    if (!is_array($corps)) {
        salfa_erreur('Corps JSON invalide.', 400);
    }
    $items = isset($corps['items']) ? $corps['items'] : null;
    $seeds = (isset($corps['seeds']) && is_array($corps['seeds'])) ? $corps['seeds'] : array();
    unset($corps);
    if (!is_array($items) || count($items) < 1 || count($items) > 50) {
        salfa_erreur('Champ `items` invalide (1 à 50 demandes attendues).', 400);
    }
    $norm = array();
    foreach ($items as $pos => $item) {
        if (!is_array($item)) {
            salfa_erreur('Demande n°' . $pos . ' invalide.', 400);
        }
        $kind = isset($item['kind']) ? (string) $item['kind'] : '';
        $periode = isset($item['period']) ? (string) $item['period'] : '';
        if ($kind === 'standard') {
            if (preg_match('/^\d{6}$/', $periode) !== 1) {
                salfa_erreur('Demande n°' . $pos . ' invalide (période AAMMJJ attendue).', 400);
            }
        } elseif ($kind === 'societe') {
            if (preg_match('/^\d{4}$/', $periode) !== 1) {
                salfa_erreur('Demande n°' . $pos . ' invalide (période AAMM attendue).', 400);
            }
        } else {
            salfa_erreur('Demande n°' . $pos . ' invalide (kind standard|societe attendu).', 400);
        }
        $norm[] = array($kind, $periode);
    }

    try {
        $pdo = salfa_pdo();
        // Migration 002 oubliée → message actionnable au lieu d'une erreur obscure.
        try {
            $pdo->query('SELECT 1 FROM `sequences` LIMIT 1');
        } catch (Exception $e) {
            salfa_erreur('Table `sequences` absente : importez wamp_deploy/database/migrations/002_sequences.sql dans phpMyAdmin.', 500);
        }
        salfa_session_exige($pdo);
        $pdo->beginTransaction();
        $sel = $pdo->prepare('SELECT `seq` FROM `sequences` WHERE `kind` = :k AND `periode` = :p FOR UPDATE');
        $upd = $pdo->prepare('UPDATE `sequences` SET `seq` = :s WHERE `kind` = :k AND `periode` = :p');
        $ins = $pdo->prepare('INSERT INTO `sequences` (`kind`, `periode`, `seq`) VALUES (:k, :p, :s)');
        $memo = array(); // "kind|periode" => dernier ordre attribué DANS ce lot
        $seqs = array();
        foreach ($norm as $n) {
            list($kind, $periode) = $n;
            $cle = $kind . '|' . $periode;
            if (isset($memo[$cle])) {
                $memo[$cle]++;
                $upd->execute(array(':s' => $memo[$cle], ':k' => $kind, ':p' => $periode));
                $seqs[] = $memo[$cle];
                continue;
            }
            $sel->execute(array(':k' => $kind, ':p' => $periode));
            $ligne = $sel->fetch();
            if ($ligne) {
                $suivant = (int) $ligne['seq'] + 1;
                $upd->execute(array(':s' => $suivant, ':k' => $kind, ':p' => $periode));
            } else {
                // Période inédite : amorçage depuis l'historique complet
                // (poste demandeur + base, qui voit aussi les autres postes).
                $max = salfa_max_ordre_periode($seeds, $kind, $periode);
                $dans_base = salfa_max_ordre_base($pdo, $kind, $periode);
                if ($dans_base > $max) {
                    $max = $dans_base;
                }
                $suivant = $max + 1;
                try {
                    $ins->execute(array(':k' => $kind, ':p' => $periode, ':s' => $suivant));
                } catch (Exception $e) {
                    // Concurrence extrême : un autre poste a créé la ligne
                    // entre-temps → on repart de sa valeur, sous notre verrou.
                    $sel->execute(array(':k' => $kind, ':p' => $periode));
                    $ligne2 = $sel->fetch();
                    if (!$ligne2) {
                        throw $e;
                    }
                    $suivant = (int) $ligne2['seq'] + 1;
                    $upd->execute(array(':s' => $suivant, ':k' => $kind, ':p' => $periode));
                }
            }
            $memo[$cle] = $suivant;
            $seqs[] = $suivant;
        }
        $pdo->commit();
        salfa_repondre(array('success' => true, 'seqs' => $seqs));
    } catch (Exception $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        salfa_erreur('Numérotation impossible (aucun numéro attribué).', 500, $e->getMessage());
    }
}

/* -------------------------------------------------------- utilisateurs --- */
if ($action === 'utilisateurs' && $methode === 'GET') {
    // Liste PUBLIQUE des comptes (écran de connexion) : identifiants + rôles
    // uniquement, JAMAIS de mot de passe.
    try {
        $pdo = salfa_pdo();
        $stmt = $pdo->query('SELECT `donnees` FROM `utilisateurs`');
        $users = array();
        while (($json = $stmt->fetchColumn()) !== false) {
            $obj = json_decode($json, true);
            if (!is_array($obj) || !isset($obj['id'])) continue;
            $users[] = array(
                'id' => (string) $obj['id'],
                'name' => isset($obj['name']) ? (string) $obj['name'] : (string) $obj['id'],
                'role' => isset($obj['role']) ? (string) $obj['role'] : 'receptionist',
                'roles' => isset($obj['roles']) && is_array($obj['roles']) ? array_values($obj['roles']) : array(),
            );
        }
        $stmt->closeCursor();
        salfa_repondre(array('success' => true, 'users' => $users));
    } catch (Exception $e) {
        salfa_erreur('Lecture des comptes impossible.', 500, $e->getMessage());
    }
}

/* ----------------------------------------------------------------- login --- */
if ($action === 'login' && $methode === 'POST') {
    $brut = file_get_contents('php://input');
    $corps = ($brut === false || $brut === '') ? null : json_decode($brut, true);
    unset($brut);
    $id = (is_array($corps) && isset($corps['id'])) ? (string) $corps['id'] : '';
    $mdp = (is_array($corps) && isset($corps['password'])) ? (string) $corps['password'] : '';
    unset($corps);
    // Anti-force brute : 5 échecs par compte (et par IP) = 15 minutes
    // d'attente. Sans cela, les comptes par défaut du dépôt se laissent
    // deviner en quelques heures sur un réseau local ouvert.
    $ip = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '?';
    $cle_essai = sha1($ip . '|' . $id);
    list($bloque, $attente) = salfa_essais_consulter($cle_essai);
    if ($bloque) {
        salfa_log('CONNEXION REFUSÉE — « ' . $id . ' » bloqué ' . $attente . ' s (IP ' . $ip . ').');
        salfa_erreur('Trop de tentatives échouées : réessayez dans ' . ceil($attente / 60) . ' minute(s).', 429);
    }
    if (!salfa_id_valide($id) || $mdp === '' || strlen($mdp) > 200) {
        salfa_erreur('Identifiant ou mot de passe incorrect.', 401);
    }
    try {
        $pdo = salfa_pdo();
        try {
            $pdo->query('SELECT 1 FROM `sessions` LIMIT 1');
        } catch (Exception $e) {
            salfa_erreur('Table `sessions` absente : importez wamp_deploy/database/migrations/002_sequences.sql dans phpMyAdmin.', 500);
        }
        $stmt = $pdo->prepare('SELECT `donnees` FROM `utilisateurs` WHERE `id` = :id LIMIT 1');
        $stmt->execute(array(':id' => $id));
        $row = $stmt->fetch();
        $obj = ($row && isset($row['donnees'])) ? json_decode($row['donnees'], true) : null;
        $stocke = (is_array($obj) && isset($obj['password'])) ? $obj['password'] : '';
        list($ok, $upgrade) = salfa_verifier_mot_de_passe($mdp, $stocke);
        if (!$ok) {
            salfa_essais_enregistrer($cle_essai, false);
            salfa_log('ÉCHEC DE CONNEXION — « ' . $id . ' » depuis ' . $ip . '.');
            salfa_erreur('Identifiant ou mot de passe incorrect.', 401);
        }
        salfa_essais_enregistrer($cle_essai, true);
        // Migration paresseuse vers bcrypt + délivrance du jeton (atomiques).
        $pdo->beginTransaction();
        if ($upgrade !== null) {
            $obj['password'] = $upgrade;
            $json = json_encode($obj, JSON_UNESCAPED_UNICODE);
            if ($json === false) throw new Exception('Encodage utilisateur impossible.');
            $maj = $pdo->prepare('UPDATE `utilisateurs` SET `donnees` = :d WHERE `id` = :id');
            $maj->execute(array(':d' => $json, ':id' => $id));
            salfa_revision_marquer($pdo, 1); // les autres postes doivent relire les comptes
        }
        try {
            $jeton = bin2hex(random_bytes(32));
        } catch (Exception $e) {
            throw new Exception('Générateur aléatoire indisponible.');
        }
        $expire = date('Y-m-d H:i:s', time() + 12 * 3600);
        $sess = $pdo->prepare('INSERT INTO `sessions` (`jeton`, `utilisateur_id`, `role`, `expire_le`) VALUES (:j, :u, :r, :e)');
        $sess->execute(array(':j' => $jeton, ':u' => $id, ':r' => isset($obj['role']) ? (string) $obj['role'] : '', ':e' => $expire));
        $pdo->exec("DELETE FROM `sessions` WHERE `expire_le` < NOW()");
        $pdo->commit();
        salfa_repondre(array(
            'success' => true,
            'user' => array(
                'id' => $id,
                'name' => isset($obj['name']) ? (string) $obj['name'] : $id,
                'role' => isset($obj['role']) ? (string) $obj['role'] : 'receptionist',
                'roles' => isset($obj['roles']) && is_array($obj['roles']) ? array_values($obj['roles']) : array(),
            ),
            'token' => $jeton,
            'expiresAt' => date('c', time() + 12 * 3600),
        ));
    } catch (Exception $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        salfa_erreur('Connexion impossible.', 500, $e->getMessage());
    }
}

/* -------------------------------------------------------------- logout --- */
if ($action === 'logout' && $methode === 'POST') {
    // Révocation immédiate du jeton. Sans cela, un poste partagé (ou un poste
    // volé) garde un accès valide aux données pendant 12 h après la
    // déconnexion affichée à l'écran.
    $brut = file_get_contents('php://input');
    $corps = ($brut === false || $brut === '') ? null : json_decode($brut, true);
    unset($brut);
    $jeton = '';
    if (isset($_SERVER['HTTP_X_SESSION_TOKEN']) && is_string($_SERVER['HTTP_X_SESSION_TOKEN'])) {
        $jeton = trim($_SERVER['HTTP_X_SESSION_TOKEN']);
    }
    if ($jeton === '' && is_array($corps) && isset($corps['token']) && is_string($corps['token'])) {
        $jeton = trim($corps['token']);
    }
    if (preg_match('/^[0-9a-f]{64}$/', $jeton) !== 1) {
        salfa_repondre(array('success' => true, 'deja' => true)); // rien à révoquer
    }
    try {
        $pdo = salfa_pdo();
        $del = $pdo->prepare('DELETE FROM `sessions` WHERE `jeton` = :j');
        $del->execute(array(':j' => $jeton));
        salfa_repondre(array('success' => true));
    } catch (Exception $e) {
        // Table `sessions` absente ou base injoignable : le client oublie de
        // toute façon son jeton localement ; on ne renvoie pas une erreur bloquante.
        salfa_repondre(array('success' => false));
    }
}

/* -------------------------------------------------------------- password --- */
if ($action === 'password' && $methode === 'POST') {
    // Redéfinition du mot de passe d'un compte, par un ADMINISTRATEUR connecté.
    // (Seule écriture possible d'un mot de passe existant : sync_all préserve
    // toujours celui en base.)
    $brut = file_get_contents('php://input');
    $corps = ($brut === false || $brut === '') ? null : json_decode($brut, true);
    unset($brut);
    if (!is_array($corps)) {
        salfa_erreur('Corps JSON invalide.', 400);
    }
    try {
        $pdo = salfa_pdo();
        $session = salfa_session_exige($pdo, $corps);
        // `utilisateurs` est une table SENSIBLE : on la relit en base (jamais
        // depuis le cache du poste, que l'interface peut avoir modifié).
        $stmt = $pdo->prepare('SELECT `donnees` FROM `utilisateurs` WHERE `id` = :id LIMIT 1');
        $stmt->execute(array(':id' => $session['id']));
        $row = $stmt->fetch();
        $dem = ($row && isset($row['donnees'])) ? json_decode($row['donnees'], true) : null;
        if (!is_array($dem)) {
            salfa_erreur('Compte administrateur introuvable en base.', 403);
        }
        $roles = (isset($dem['roles']) && is_array($dem['roles'])) ? $dem['roles'] : array();
        $role = isset($dem['role']) ? (string) $dem['role'] : '';
        if ($role !== 'admin' && !in_array('admin', $roles, true)) {
            salfa_erreur('Réservé à l’administrateur.', 403);
        }
        $cible = isset($corps['id']) ? (string) $corps['id'] : '';
        $nouveau = isset($corps['password']) ? (string) $corps['password'] : '';
        // 8 caractères minimum : un compte de données de santé ouvert sur un
        // réseau local ne résiste pas à 4 caractères sur dix ans.
        if (!salfa_id_valide($cible) || strlen($nouveau) < 8 || strlen($nouveau) > 200) {
            salfa_erreur('Compte ou mot de passe invalide (8 à 200 caractères).', 400);
        }
        if (in_array(strtolower($nouveau), array(
            'admin123', 'doc123', 'caisse123', 'pharma123', 'mag123', 'labo123', 'fact123', 'rec123',
            'motdepasse', 'password', 'azerty', 'azertyuiop', '12345678', 'salfa123', 'bonjour123'
        ), true)) {
            salfa_erreur('Mot de passe trop prévisible (liste des mots de passe par défaut).', 400);
        }
        $stmt = $pdo->prepare('SELECT `donnees` FROM `utilisateurs` WHERE `id` = :id LIMIT 1');
        $stmt->execute(array(':id' => $cible));
        $row = $stmt->fetch();
        if (!$row || !isset($row['donnees'])) {
            salfa_erreur('Compte introuvable.', 404);
        }
        $obj = json_decode($row['donnees'], true);
        if (!is_array($obj)) {
            salfa_erreur('Compte illisible.', 500);
        }
        $obj['password'] = password_hash($nouveau, PASSWORD_BCRYPT);
        $json = json_encode($obj, JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            salfa_erreur('Encodage impossible.', 500);
        }
        $pdo->beginTransaction();
        $maj = $pdo->prepare('UPDATE `utilisateurs` SET `donnees` = :d WHERE `id` = :id');
        $maj->execute(array(':d' => $json, ':id' => $cible));
        // Le nouveau mot de passe prend effet partout : les autres postes de ce
        // compte sont déconnectés (sinon un poste laissé ouvert reste ouvert).
        $del_sess = $pdo->prepare('DELETE FROM `sessions` WHERE `utilisateur_id` = :u');
        $del_sess->execute(array(':u' => $cible));
        salfa_revision_marquer($pdo, 1);
        $pdo->commit();
        salfa_log('Mot de passe redéfini pour « ' . $cible . ' » par « ' . $session['id'] . ' » (sessions de ce compte révoquées).');
        salfa_repondre(array('success' => true));
    } catch (Exception $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        salfa_erreur('Changement de mot de passe impossible.', 500, $e->getMessage());
    }
}

/* ------------------------------------------------------- action inconnue --- */
salfa_erreur(
    'Action inconnue. Actions valides : info (GET), poll (GET), read_all (GET), sync_all (POST), numero (POST), utilisateurs (GET), login (POST), logout (POST), password (POST).',
    400
);
