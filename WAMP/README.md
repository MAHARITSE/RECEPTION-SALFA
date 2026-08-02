# RECEPTION SALFA — Version WAMP complète

Ce dossier `WAMP/` contient une version prête à copier dans WAMP, sans modifier la version JSON/source du projet située en dehors de ce dossier.

## Contenu

```text
WAMP/
├── index.html                  # Application React/Vite compilée en un seul fichier
├── .htaccess                   # Réécriture Apache pour l'application
├── api/                        # API PHP utilitaire WAMP (santé + état applicatif)
├── config/db_config.php        # Connexion MySQL/PDO WAMP
├── database/                   # Scripts SQL d'import
├── apache/reception-salfa.conf # Exemple VirtualHost/Alias Apache
├── deployment/                 # Scripts Windows d'installation/vérification
├── uploads/                    # Dossier fichiers téléversés
└── storage/                    # Stockage applicatif local WAMP
```

## Installation rapide

1. Vérifier que WAMP est démarré et vert.
2. Copier le dossier `WAMP` dans `C:\wamp64\www\reception-salfa`.
3. Dans phpMyAdmin, créer/importer la base avec :
   - `database/import_full.sql` pour les tables métier existantes ;
   - `database/import_wamp_state.sql` pour l'état JSON initial WAMP.
4. Ouvrir : `http://localhost/reception-salfa/`.

Vous pouvez aussi lancer :

```cmd
WAMP\deployment\install_wamp.bat
```

## Comptes présents dans l'application compilée

Ces comptes viennent de la version JSON actuelle, copiée au moment du build :

| Rôle | Identifiant affiché | Mot de passe |
|---|---|---|
| Admin | Admin Système | `admin123` |
| Réception | Aina Rakoto | `rec123` |
| Médecin | Dr. Feno Rasoana / Dr. Mialy Andria | `doc123` |
| Caisse | Caisse 1 - Miora Kanto / Caisse 2 - Pierre Duval | `caisse123` |
| Pharmacie | Pharmacie 1 - Tiana Soa / Pharmacie 2 - Fatima Benali | `pharma123` |
| Laboratoire | Hery Lanto | `labo123` |
| Magasinier | Niry Tahina | `mag123` |
| Facturation sociétés | Lova Sitraka | `fact123` |

## API WAMP utilitaire

- Santé : `http://localhost/reception-salfa/api/health.php`
- État : `http://localhost/reception-salfa/api/state.php`

L'API `state.php` lit/écrit l'état complet dans la table `salfa_app_state`. Elle est fournie pour les intégrations WAMP/PHP et les sauvegardes serveur. L'application compilée reste identique à la version JSON d'origine afin de respecter la demande de ne rien changer en dehors du dossier `WAMP/`.

## Important

- Aucun fichier JSON/source hors du dossier `WAMP/` n'a été modifié.
- Le fichier `index.html` est autonome : CSS et JavaScript sont intégrés.
- Si vous changez le nom du dossier web, adaptez `APP_URL` dans `config/db_config.php` et l'Alias Apache si vous l'utilisez.
