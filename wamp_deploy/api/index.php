<?php
/*
 * RECEPTION SALFA — API d'état MySQL (WAMP)
 * ============================================================================
 *   GET  api/index.php?action=info      → heure serveur + version de schéma
 *   GET  api/index.php?action=read_all  → état complet { success, datasets }
 *   POST api/index.php?action=sync_all  → sauvegarde { datasets, deletions? }
 *
 * RÈGLES DE SÉCURITÉ DES DONNÉES :
 *  - sync_all est TRANSACTIONNEL : tout est enregistré, ou rien (jamais
 *    une sauvegarde à moitié écrite).
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
        $datasets = array();

        foreach (salfa_tables() as $dataset => $table) {
            $lignes = array();
            $stmt = $pdo->query('SELECT `donnees` FROM `' . $table . '`');
            while (($json = $stmt->fetchColumn()) !== false) {
                $obj = json_decode($json, true);
                // Les lignes corrompues sont signalées et ignorées (jamais de crash).
                if (is_array($obj)) {
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

/* ------------------------------------------------------- action inconnue --- */
salfa_erreur(
    'Action inconnue. Actions valides : info (GET), read_all (GET), sync_all (POST).',
    400
);
