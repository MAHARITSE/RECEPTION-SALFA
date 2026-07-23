# Guide de Démarrage Rapide - WAMP Deployment

## Installation en 5 minutes

### Étape 1: Préparer WAMP
1. Installez WAMP Server 3.x depuis https://www.wampserver.com/
2. Lancez WAMP (icône verte dans la barre des tâches)
3. Vérifiez que les services Apache et MySQL sont actifs

### Étape 2: Configurer la Base de Données
1. Ouvrez phpMyAdmin: http://localhost/phpmyadmin
2. Créez une base: `reception_salfa`
3. Importez le fichier: `wamp_deploy/database/import_full.sql`

### Étape 3: Configurer Apache
1. Copiez `wamp_deploy/apache/reception-salfa.conf` vers:
   `C:\wamp64\conf\extra\reception-salfa.conf`
2. Modifiez `C:\wamp64\bin\apache\apache2.4.x\conf\httpd.conf`
3. Ajoutez cette ligne à la fin:
   ```
   Include conf/extra/reception-salfa.conf
   ```
4. Redémarrez WAMP

### Étape 4: Déployer l'Application
Exécutez dans le dossier du projet:
```cmd
wamp_deploy\deployment\deploy.bat
```

### Étape 5: Accéder à l'Application
- **Local**: http://localhost/reception-salfa
- **Réseau**: http://192.168.1.50/reception-salfa

## Comptes de Test

| Utilisateur | Mot de passe | Rôle |
|------------|--------------|------|
| ADM001 | admin123 | Administrateur |
| DOC001 | doc123 | Médecin (Dr. Jean Martin) |
| CAS001 | caisse123 | Caissier |
| PHA001 | pharma123 | Pharmacien |
| MAG001 | mag123 | Magasinier |
| LAB001 | labo123 | Laboratoire |
| HOS001 | hosp123 | Hospitalisation |

> La **Réception** n'a pas besoin de connexion (accès libre).

## Résolution des Problèmes

### Apache ne démarre pas
- Vérifiez le port 80: `netstat -ano | findstr :80`
- Changez le port dans `httpd.conf` si nécessaire

### Erreur de connexion MySQL
- Vérifiez que MySQL est démarré (icône WAMP verte)
- Le mot de passe par défaut est vide pour root

### Page blanche
- Activez l'affichage des erreurs PHP
- Vérifiez le fichier `config/db_config.php`

## Structure des URLs

```
http://localhost/reception-salfa
├── /                    → Page d'accueil (Réception)
├── /connexion           → Connexion
├── /caisse              → Module Caisse
├── /pharmacie           → Module Pharmacie
├── /medecin             → Module Médecin
├── /laboratoire         → Module Laboratoire
├── /magasinier          → Module Magasinier
├── /administration       → Module Administration
└── /messagerie          → Messagerie interne
```
