<?php
/*
 * RECEPTION SALFA — API d'état MySQL (WAMP)
 * ============================================================================
 *   GET  api/index.php?action=info      → heure serveur + version de schéma
 *   GET  api/index.php?action=read_all  → état complet { success, datasets }
 *   POST api/index.php?action=sync_all  → sauvegarde { datasets, deletions? }
 *   POST api/index.php?action=numero    → numéros de facture { items, seeds? }
 *                                          → { success, seqs: [ordres…] }
 *   GET  api/index.php?action=utilisateurs → comptes publics (sans mots de passe)
 *   POST api/index.php?action=login       → { id, password } → { user, token }
 *   POST api/index.php?action=password    → redéfinition admin { id, password }
 *
 * RÈGLES DE SÉCURITÉ DES DONNÉES :
 *  - sync_all est TRANSACTIONNEL : tout est enregistré, ou rien (jamais
 *    une sauvegarde à moitié écrite).
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

/* ------------------------------------------------------------ read_all --- */
if ($action === 'read_all' && $methode === 'GET') {
    try {
        $pdo = salfa_pdo();
        salfa_session_exige($pdo);
        $datasets = array();

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

        salfa_repondre(array('success' => true, 'datasets' => $datasets));
    } catch (Exception $e) {
        salfa_erreur('Lecture MySQL impossible.', 500, $e->getMessage());
    }
}

/* ------------------------------------------------------------ sync_all --- */
if ($action === 'sync_all' && $methode === 'POST') {
    // Garde-fou mémoire : refuse les corps démesurés avant de les lire.
    $taille_max = SALFA_MAX_BODY_MB * 1024 * 1024;
    $annonce = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($annonce > $taille_max) {
        salfa_erreur('Sauvegarde trop volumineuse (' . round($annonce / 1048576) . ' Mo).', 413);
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
    try {
        $pdo = salfa_pdo();
        salfa_session_exige($pdo, $jeton_corps);
        $pdo->beginTransaction();

        foreach ($tables as $dataset => $table) {
            // Dataset absent du payload → on n'y touche PAS (jamais de vidage implicite).
            if (!array_key_exists($dataset, $datasets) || !is_array($datasets[$dataset])) {
                continue;
            }
            $maj = $pdo->prepare(
                'INSERT INTO `' . $table . '` (`id`, `donnees`, `numero_ref`, `dossier_ref`)'
                . ' VALUES (:id, :donnees, :numero, :dossier)'
                . ' ON DUPLICATE KEY UPDATE `donnees` = VALUES(`donnees`),'
                . ' `numero_ref` = VALUES(`numero_ref`), `dossier_ref` = VALUES(`dossier_ref`)'
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
            }

            // Suppressions explicites uniquement.
            if (isset($suppressions[$dataset]) && is_array($suppressions[$dataset])
                && count($suppressions[$dataset]) > 0) {
                foreach (array_chunk(array_values($suppressions[$dataset]), 500) as $lot) {
                    $marqueurs = implode(',', array_fill(0, count($lot), '?'));
                    $del = $pdo->prepare('DELETE FROM `' . $table . '` WHERE `id` IN (' . $marqueurs . ')');
                    $del->execute($lot);
                }
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
        }

        $pdo->commit();
        salfa_repondre(array('success' => true));
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
    $taille_max = SALFA_MAX_BODY_MB * 1024 * 1024;
    $annonce = isset($_SERVER['CONTENT_LENGTH']) ? (int) $_SERVER['CONTENT_LENGTH'] : 0;
    if ($annonce > $taille_max) {
        salfa_erreur('Requête trop volumineuse (' . round($annonce / 1048576) . ' Mo).', 413);
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
            usleep(200000); // frein anti-essais en rafale (message unique : pas d'énumération)
            salfa_erreur('Identifiant ou mot de passe incorrect.', 401);
        }
        // Migration paresseuse vers bcrypt + délivrance du jeton (atomiques).
        $pdo->beginTransaction();
        if ($upgrade !== null) {
            $obj['password'] = $upgrade;
            $json = json_encode($obj, JSON_UNESCAPED_UNICODE);
            if ($json === false) throw new Exception('Encodage utilisateur impossible.');
            $maj = $pdo->prepare('UPDATE `utilisateurs` SET `donnees` = :d WHERE `id` = :id');
            $maj->execute(array(':d' => $json, ':id' => $id));
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
        $stmt = $pdo->prepare('SELECT `donnees` FROM `utilisateurs` WHERE `id` = :id LIMIT 1');
        $stmt->execute(array(':id' => $session['id']));
        $row = $stmt->fetch();
        $dem = ($row && isset($row['donnees'])) ? json_decode($row['donnees'], true) : null;
        $roles = (is_array($dem) && isset($dem['roles']) && is_array($dem['roles'])) ? $dem['roles'] : array();
        $role = (is_array($dem) && isset($dem['role'])) ? (string) $dem['role'] : '';
        if ($role !== 'admin' && !in_array('admin', $roles, true)) {
            salfa_erreur('Réservé à l’administrateur.', 403);
        }
        $cible = isset($corps['id']) ? (string) $corps['id'] : '';
        $nouveau = isset($corps['password']) ? (string) $corps['password'] : '';
        if (!salfa_id_valide($cible) || strlen($nouveau) < 4 || strlen($nouveau) > 200) {
            salfa_erreur('Compte ou mot de passe invalide (4 à 200 caractères).', 400);
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
        $maj = $pdo->prepare('UPDATE `utilisateurs` SET `donnees` = :d WHERE `id` = :id');
        $maj->execute(array(':d' => $json, ':id' => $cible));
        salfa_log('Mot de passe redéfini pour « ' . $cible . ' » par « ' . $session['id'] . ' ».');
        salfa_repondre(array('success' => true));
    } catch (Exception $e) {
        salfa_erreur('Changement de mot de passe impossible.', 500, $e->getMessage());
    }
}

/* ------------------------------------------------------- action inconnue --- */
salfa_erreur(
    'Action inconnue. Actions valides : info (GET), read_all (GET), sync_all (POST), numero (POST), utilisateurs (GET), login (POST), password (POST).',
    400
);
