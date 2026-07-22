# WAMP Deployment - RECEPTION SALFA

## Description
Ce dossier contient tous les fichiers nécessaires pour déployer l'application RECEPTION SALFA sur un serveur WAMP (Windows, Apache, MySQL, PHP).

## Prérequis
- WAMP Server 3.0+ installé
- Apache 2.4+
- PHP 8.0+
- MySQL 5.7+ / MariaDB 10.3+
- URL Rewrite Module activé dans Apache

## Structure du dossier
```
wamp_deploy/
├── README.md                    # Ce fichier
├── apache/
│   └── reception-salfa.conf    # Configuration VirtualHost Apache
├── database/
│   ├── import_structure.sql     # Script de création des tables
│   └── import_data.sql          # Script d'insertion des données initiales
├── deployment/
│   └── deploy.bat              # Script de déploiement automatique
├── .htaccess                    # Règles de réécriture pour React Router
└── config/
    └── db_config.php           # Configuration de la connexion base de données
```

## Étapes d'installation

### 1. Configuration Apache
1. Copier `apache/reception-salfa.conf` vers le dossier `conf/extra/` de WAMP
2. Inclure ce fichier dans `httpd.conf`:
   ```
   Include conf/extra/reception-salfa.conf
   ```
3. Modifier le chemin `DocumentRoot` et `Directory` selon votre installation
4. Redémarrer WAMP

### 2. Base de données MySQL
1. Ouvrir phpMyAdmin (http://localhost/phpmyadmin)
2. Créer une base de données nommée `reception_salfa`
3. Exécuter `database/import_structure.sql`
4. Exécuter `database/import_data.sql` (optionnel - données de test)

### 3. Déployer les fichiers
1. Builder l'application:
   ```bash
   npm run build
   ```
2. Copier le contenu du dossier `dist/` vers le dossier défini dans `DocumentRoot`
3. Ou utiliser le script `deployment/deploy.bat`

### 4. Accéder à l'application
- URL locale: http://localhost/reception-salfa
- URL réseau: http://[IP_SERVEUR]/reception-salfa

## Configuration réseau
Pour accéder depuis d'autres postes, vérifier:
- Le pare-feu autorise le port 80 (HTTP)
- L'option `Require all granted` est présente dans la configuration Apache
- L'adresse IP du serveur est 192.168.1.50 (modifiable dans apache/reception-salfa.conf)

## Support
Pour toute question, consulter la documentation principale du projet.
