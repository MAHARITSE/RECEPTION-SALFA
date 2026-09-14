# PERFORMANCE & EXPLOITATION — RECEPTION SALFA sur WAMP

> Document d'exploitation pour un rythme de **100+ passages par jour** et une durée de
> **10 ans**. Justifications chiffrées, preuves et cotes : `docs/AUDIT_WAMP_100_PAR_JOUR.md`.
> Les fichiers `config/wamp-salfa-*.ini.txt` sont les blocs prêts à coller.

---

## 1. Ordre d'installation (une seule fois)

```bat
:: 1. Assainir MySQL (compte applicatif, root verrouillé)
"C:\wamp64\bin\mysql\mysql8.0.xx\bin\mysql.exe" -u root < outils\hygiene_mysql.sql

:: 2. Configurer l'API
copy api\config.local.php.exemple api\config.local.php   :: puis éditer user/pass

:: 3. Sauvegarder AVANT de toucher au schéma
outils\sauvegarder.bat

:: 4. Schéma + migration de performance (poll + index de fraîcheur)
::    phpMyAdmin → base reception_salfa → importer database\schema.sql
::    (nouvelle base) PUIS database\migrations\003_performance.sql (base existante)

:: 5. Réglages serveur
::    copier config\wamp-salfa-php.ini.txt dans le php.ini de WAMP
::    copier config\wamp-salfa-mysql.ini.txt dans la section [mysqld] du my.ini
::    WAMP → Right click → Restart All Services

:: 6. Mesurer ce que tient VOTRE serveur (hors heures d'ouverture)
cd outils
"C:\wamp64\bin\php\php8.3.x\php.exe" test_charge.php
```

Étape 6 est à refaire **après chaque montée de volume sensible** (trimestre) : c'est
elle qui donne la date de franchissement des limites, pas une moyenne théorique.

---

## 2. Ce que chaque réglage évite

| Réglage | Défaut WAMP | Sans correction | Après correction |
|---|---|---|---|
| `memory_limit` | 128M | `read_all` (qui renvoie **toute** la base) plante en erreur opaque vers **3 semaines à 3 mois** d'exploitation : messages « Échec de la synchronisation MySQL », saisies non enregistrées | réponse `413` explicite + plafond aligné sur la config ; 1 Go = ~6 à 9 mois de marge |
| `post_max_size` | 8M | restauration d'un dump impossible depuis phpMyAdmin (il dépasse 8 Mo dès ~1 semaine de données) — l'API, elle, lit le corps brut et n'est pas bornée par cette valeur | 256M (import direct par `outils\restaurer.bat` : `mysql < dump.sql`, non limité) |
| `max_allowed_packet` | **1M** | `MySQL server has gone away` sur les lignes volumineuses (clôtures de garde de 60-80 Ko × lots, imports de dumps de quelques Mo) et sur les requêtes de numérotation en fin de mois | 64M |
| `innodb_buffer_pool_size` | 16M-128M | toute relecture repasse par le disque : le temps de `read_all` est multiplié par 3 à 10 sur un SSD de PC de bureau | 1G |
| `log_bin` | ON, **sans purge** | le journal binaire grossit sur le **même disque** que la base : plusieurs Go/semaine à ce rythme → disque plein → MySQL ne peut plus écrire, sauvegardes échouées | `skip-log-bin` |
| `Timeout` Apache | 60 s | la relecture est coupée côté réseau : le poste croit l'écriture perdue alors qu'elle a parfois abouti | 300 s (et `max_execution_time` aligné) |
| `ThreadsPerChild` | 64 | mod_php mono-processus : 4-5 relectures lourdes simultanées bouchent Apache, tous les postes ralentissent | FastCGI ou 128 threads + la sonde `poll` (qui supprime 95 % des relectures) |
| MySQL `bind-address` | toutes interfaces | **root sans mot de passe accessible depuis tout le réseau** = lecture/effacement direct des dossiers médicaux | 127.0.0.1 + compte `salfa` limité |

---

## 3. Budget de performance à respecter (à vérifier, pas à espérer)

| Opération | Cible | Comment la mesurer |
|---|---|---|
| Ouverture d'un poste (read_all initial) | < 3 s | F12 → Network → `action=read_all` |
| Enregistrement d'une saisie (sync_all) | < 1,5 s | pastille de synchronisation ; payload < 500 Ko dans Network |
| Sondage périodique (poll) | < 50 ms | `php outils/test_charge.php` §3 |
| Émission d'une facture (action=numero) | < 200 ms | journal `api/logs/` ; sinon vérifier les doublons via `diagnostic.php` |
| Charge HTTP du serveur en pointe | < 60 % d'un cœur | Gestionnaire de tâches, `httpd.exe` + `mysqld.exe` |

Dépassement répété = signal d'archivage ou de passage à l'API incrémentale
(`docs/AUDIT_WAMP_100_PAR_JOUR.md` §7.1). Ne pas « régler » en augmentant encore
`memory_limit` : le pic à 10 ans est de l'ordre de 17 Go, pas d'un facteur 2.

---

## 4. Volumétrie : ce que la base peut contenir

Avec le protocole actuel (lecture complète à la connexion + écriture différentielle
depuis cette version) :

| Volume de base | État | Action |
|---|---|---|
| < 50 Mo | confortable | rien |
| 50-150 Mo | à surveiller | vérifier `memory_limit`, activer l'archivage des années closes, programmer la phase incrémentale |
| 150-500 Mo | la connexion de chaque poste devient lente (> 5 s) | **archivage obligatoire** + phase incrémentale à lancer |
| > 500 Mo | l'application devient inutilisable sans API incrémentale | ne plus attendre : §7 de l'audit |

Estimation à 100 passages/jour avec des fiches de taille moyenne : **~30 Mo/mois**,
soit ~350 Mo/an. La table qui grossit le plus vite est `parcours_patient`
(~11 lignes/passage) puis `journal_audit` et `lignes_vente`.

---

## 5. Archivage des années closes (le vrai remède au grossissement)

Le principe : sortir de la base active ce qui n'est plus modifié, le conserver dans une
base d'archive, et ne jamais « nettoyer » depuis l'interface.

⚠️ **Ne jamais vider une collection depuis l'application** (Administration → purger le
journal, supprimer d'anciennes consultations en masse) : le protocole de fusion
interprète toute ligne présente dans la référence locale et absente de l'envoi comme
une **suppression à propager** — vous perdriez les lignes chez tous les postes.
(`src/syncMerge.ts` → `collectDeletions`.)

Procédure, hors heures d'ouverture, après un `sauvegarder.bat` :

```sql
CREATE DATABASE IF NOT EXISTS reception_salfa_archive
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Une table miroir par dataset archivé (structure identique, sans les index métier)
CREATE TABLE IF NOT EXISTS reception_salfa_archive.consultations LIKE reception_salfa.consultations;
CREATE TABLE IF NOT EXISTS reception_salfa_archive.ventes           LIKE reception_salfa.ventes;
CREATE TABLE IF NOT EXISTS reception_salfa_archive.lignes_vente     LIKE reception_salfa.lignes_vente;
CREATE TABLE IF NOT EXISTS reception_salfa_archive.journal_audit    LIKE reception_salfa.journal_audit;
CREATE TABLE IF NOT EXISTS reception_salfa_archive.parcours_patient LIKE reception_salfa.parcours_patient;

INSERT IGNORE INTO reception_salfa_archive.consultations
  SELECT c.* FROM reception_salfa.consultations c
  WHERE c.`mis_a_jour` < DATE_SUB(CURDATE(), INTERVAL 24 MONTH);
-- (idem pour chaque table ; la clause WHERE suit le même modèle :
--  sur les tables métier sans colonne date utile, joindre la table parent
--  ex. lignes_vente via ventes.id)

DELETE c FROM reception_salfa.consultations c
  JOIN reception_salfa_archive.consultations a ON a.id = c.id
  WHERE c.`mis_a_jour` < DATE_SUB(CURDATE(), INTERVAL 24 MONTH);

OPTIMISE TABLE reception_salfa.consultations;   -- facultatif, hors heures
```

Puis : `mysqldump reception_salfa_archive` vers le disque d'archives (à conserver
**sans date de péremption** : un dossier médical doit rester communicable 20 ans et
plus selon la réglementation locale — vérifier avec l'autorité sanitaire de Madagascar).
Enfin, redémarrer les postes : le `read_all` initial recharge une base allégée.

Compteur de sécurité : l'API accepte les suppressions uniquement quand elles sont
explicitement listées, et ne peut pas être « trompée » par une base allégée
(un dataset absent du payload n'est jamais vidé).

---

## 6. Sauvegarde à 10 ans (à appliquer tel quel)

1. **Quotidien** `sauvegarder.bat` à 23 h (déjà planifiable) → puis copie sur un disque
   **externe chiffré**, déconnecté après copie, OU un partage réseau d'un autre PC.
2. **Rétention** : remplacer la rotation « 7 jours » par
   `7 quotidiens · 5 hebdomadaires · 12 mensuels · 10 annuels`.
   Ligne à modifier dans `outils/sauvegarder.bat` : `forfiles /P "%DEST%" /M *.sql /D -7`.
   Ajouter un `forfiles ... /D -3650` uniquement sur le dossier `annuel\`.
3. **Intégrité** : à la fin du script, `certutil -hashfile "%FICHIER%" SHA256 >> manifeste.txt`.
4. **Test mensuel** : restaurer le dump de la veille sur un PC d'essai, comparer les comptes :
   ```sql
   SELECT 'patients' t, COUNT(*) n FROM patients UNION ALL SELECT 'ventes', COUNT(*) FROM ventes
   UNION ALL SELECT 'consultations', COUNT(*) FROM consultations;
   ```
   Un écart = sauvegarde à reprendre (mysqldump peut avoir été interrompu par un arrêt du PC).
5. **Hors site** : une copie mensuelle chiffrée emportée (incendie/vol du cabinet = 10 ans
   d'historique). Le disque resté branché à côté du serveur ne compte pas comme sauvegarde.
6. `seed.sql` **supprimé** du dossier déployé après installation (il contient les comptes
   par défaut) — ou laissé, mais alors vérifier le test `curl` du §7.

---

## 7. Recette après chaque mise à jour / redéploiement

```bat
:: l'API répond
curl -i http://SERVEUR/reception-salfa/api/index.php?action=info
::   → 200 JSON, "schema_attendu": 3

:: les fichiers de service sont inaccessibles (403 attendu pour chacun)
curl -i http://SERVEUR/reception-salfa/database/seed.sql
curl -i http://SERVEUR/reception-salfa/api/config.local.php
curl -i http://SERVEUR/reception-salfa/api/logs/
curl -i http://SERVEUR/reception-salfa/outils/sauvegarder.bat

:: un appel sans session est refusé (401 attendu, jamais 200)
curl -i "http://SERVEUR/reception-salfa/api/index.php?action=read_all"

:: diagnostic sur le PC serveur : tout doit être vert, y compris « Révision d'état »
start http://localhost/reception-salfa/api/diagnostic.php
```

Si un `200` apparaît sur les lignes 403 : `AllowOverride` est inactif pour ce dossier.
Dans `httpd.conf` :

```apache
<Directory "c:/wamp64/www/reception-salfa">
    AllowOverride All
    Require ip 192.168.0        # réseau interne du centre uniquement
</Directory>
```

---

## 8. Surveillance trimestrielle (10 minutes)

| Contrôle | Commande / endroit | Seuil d'alerte |
|---|---|---|
| Volume de la base | `diagnostic.php` « Charge de relecture complète » | pic estimé > 40 % de `memory_limit` |
| Marge restante en jours | `php outils/test_charge.php` §5 | < 180 jours |
| Sessions oubliées | `diagnostic.php` « Sessions de travail ouvertes » | > nombre de postes réels |
| Journal `api/logs/` | ouvrir le dernier fichier | toute ligne `ERREUR 500` répétée |
| Échecs de connexion | `api/logs/api-*.log` (`ÉCHEC DE CONNEXION`) | > 10/jour sur un même compte |
| Espace disque | `diagnostic.php` | < 10 Go |
| Sauvegarde testée | `manifeste.txt` + compte rendu | test > 30 jours |
| Doublons de numérotation | `diagnostic.php` « Doublons » | un seul doublon = à traiter immédiatement (preuve comptable) |
