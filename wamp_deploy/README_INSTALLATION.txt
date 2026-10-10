============================================================================
RÉCEPTION SALFA — DÉPLOIEMENT WAMP (MYSQL FORCÉ & SCRIPTS .BAT)
============================================================================

Ce dossier est prêt à copier dans WAMP. Toutes les données et toutes les
sessions applicatives sont stockées dans MySQL.

URL de l'application : http://localhost/reception-salfa/
Dossier WAMP :         C:\wamp64\www\reception-salfa\
Base MySQL :           reception_salfa

PREREQUIS
---------
- WampServer 3.x 64 bits (icône verte)
- PHP 8.0 ou supérieur
- MySQL 8.0 ou supérieur (ou MariaDB 10.6+)
- Extensions PHP PDO, pdo_mysql activées

INSTALLATION
------------
1. Démarrer WAMP et attendre l'icône verte.
2. Copier ce dossier « wamp_deploy » dans WAMP sous le nom reception-salfa :
   C:\wamp64\www\reception-salfa\
   (le contenu de wamp_deploy va directement dans reception-salfa :
   C:\wamp64\www\reception-salfa\index.html, C:\wamp64\www\reception-salfa\api\, etc.)
3. Importer la base de données :
   - Ouvrir phpMyAdmin : http://localhost/phpmyadmin
   - Cliquer sur « Importer » et sélectionner :
     C:\wamp64\www\reception-salfa\sql\reception_salfa.sql
     (crée la base reception_salfa, toutes les tables et données initiales).
4. Configuration WAMP standard (déjà configurée dans api\config.php) :
   - serveur : 127.0.0.1
   - port : 3306
   - base : reception_salfa
   - utilisateur : root
   - mot de passe : vide
   Si votre MySQL utilise un autre mot de passe, modifier api\config.php.
5. Vérifier la connexion MySQL :
   Ouvrir : http://localhost/reception-salfa/api/diagnostic.php
   -> Le diagnostic doit afficher que MySQL est accessible et opérationnel.
6. Lancer l'application :
   Double-cliquer sur « clientwamp.bat » pour lancer en mode plein écran / Kiosque.

LANCEUR UNIVERSEL UNIQUE (.BAT) & GESTION IMPRIMANTE
---------------------------------------------------
- clientwamp.bat :
  * Détecte automatiquement l'IP du serveur WAMP (localhost si sur le serveur, ou recherche IP sur le réseau).
  * Configure le profil Kiosque avec impression directe 80mm sans aperçu.
  * Touche [P] au démarrage pour configurer ou changer l'imprimante thermique par défaut.
  * Touche [S] au démarrage pour réinitialiser ou changer l'adresse IP du serveur.
- choisir-imprimante.bat :
  * Raccourci ouvrant directement le menu interactif de sélection de l'imprimante 80mm.

BASE DE DONNÉES STRICTEMENT SQL
--------------------------------
- sql/reception_salfa.sql :
  Script SQL complet et autonome contenant la structure et l'initialisation de
  la base reception_salfa.

COMPTES INITIAUX
----------------
Administrateur : USR-ADMIN  / admin123
Médecin        : USR-DOC    / doc123
Caisse         : USR-CASH   / caisse123
Pharmacie      : USR-PHA    / pharma123
Laboratoire    : USR-LAB    / labo123
Magasinier     : USR-MAG    / mag123
Facturation    : USR-BIL    / fact123
Réception      : USR-REC    / rec123

Support technique : MAHARITSE Hyacinthe Bertrand — Tél : +261 38 34 092 61
