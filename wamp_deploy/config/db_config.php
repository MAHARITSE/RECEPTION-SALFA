<?php
/**
 * Configuration de la connexion à la base de données
 * RECEPTION SALFA
 * 
 * Ce fichier doit être copié dans le dossier de l'application
 * et ses valeurs doivent correspondre à votre configuration WAMP
 */

// Configuration de la base de données
define('DB_HOST', 'localhost');
define('DB_PORT', '3306');
define('DB_NAME', 'reception_salfa');
define('DB_USER', 'root');
define('DB_PASS', '');  // Mot de passe par défaut WAMP (vide)
define('DB_CHARSET', 'utf8mb4');

// Configuration de l'application
define('APP_NAME', 'RECEPTION SALFA');
define('APP_VERSION', '1.0.0');
define('APP_URL', 'http://localhost/reception-salfa');
define('APP_DEBUG', false);  // Mettre true pour le développement

// Configuration du serveur de fichiers
define('UPLOAD_MAX_SIZE', 10 * 1024 * 1024); // 10 MB
define('ALLOWED_FILE_TYPES', ['jpg', 'jpeg', 'png', 'pdf']);
define('UPLOAD_PATH', __DIR__ . '/../uploads/');

// Configuration email (optionnel)
define('SMTP_HOST', 'smtp.example.com');
define('SMTP_PORT', 587);
define('SMTP_USER', 'noreply@hopital.local');
define('SMTP_PASS', '');
define('SMTP_FROM', 'noreply@hopital.local');

// Fuseau horaire
date_default_timezone_set('Africa/Kinshasa');

/**
 * Fonction de connexion à la base de données
 * @return PDO
 */
function getDatabaseConnection() {
    static $pdo = null;
    
    if ($pdo === null) {
        $dsn = sprintf(
            'mysql:host=%s;port=%s;dbname=%s;charset=%s',
            DB_HOST,
            DB_PORT,
            DB_NAME,
            DB_CHARSET
        );
        
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
        ];
        
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            if (APP_DEBUG) {
                die("Erreur de connexion à la base de données: " . $e->getMessage());
            } else {
                die("Erreur de connexion à la base de données. Veuillez contacter l'administrateur.");
            }
        }
    }
    
    return $pdo;
}

/**
 * Fonction pour exécuter une requête SQL sécurisée
 * @param string $sql
 * @param array $params
 * @return PDOStatement
 */
function executeQuery($sql, $params = []) {
    $pdo = getDatabaseConnection();
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

/**
 * Fonction pour générer un identifiant unique
 * @param string $prefix
 * @return string
 */
function generateUniqueId($prefix = '') {
    return $prefix . date('YmdHis') . '-' . strtoupper(substr(uniqid(), -6));
}
?>
